/**
 * CalDAV `.ics` → typed `CalendarEvent[]` parser (NCAL-1). SERVER-ONLY.
 *
 * Uses `ical.js` (v2) for RFC-5545 correctness: folded lines, `\n`/`\,` escapes,
 * `VTIMEZONE` resolution, all-day (`VALUE=DATE`) detection, and native recurrence
 * expansion via `ICAL.Event` (which honors `VTIMEZONE` — avoiding the naive
 * ical.js/rrule DST mismatch). `ATTACH` and `SOUND` are stripped before any field
 * is read. Recurrence expansion is bounded to `[start, end)` and clamped against
 * abusively wide windows (authenticated-DoS guard).
 */
import ICAL from 'ical.js';
import { CATEGORY_MAP, CATEGORY_COLORS, DEFAULT_EVENT_COLOR } from './constants';

export interface CalendarEvent {
	uid: string;
	title: string;
	start: string; // ISO 8601
	end: string; // ISO 8601
	allDay: boolean;
	location: string | null;
	description: string | null;
	color: string;
	status: string | null;
	organizer: { name: string; email: string } | null;
	attendees: { name: string; email: string }[];
	lastModified: string | null; // ISO 8601
	category: string | null;
	url: string | null;
}

/** Hard cap on expanded occurrences per event (authenticated-DoS clamp). */
const MAX_OCCURRENCES = 1000;
/** Hard cap on the requested window width (authenticated-DoS clamp). */
const MAX_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years

/** Extracts `{ name, email }` from an ORGANIZER/ATTENDEE property (`mailto:` + `CN`). */
function parseCalAddress(prop: ICAL.Property | null): { name: string; email: string } | null {
	if (!prop) return null;
	const raw = prop.getFirstValue();
	const value = typeof raw === 'string' ? raw : String(raw ?? '');
	const email = value.replace(/^mailto:/i, '');
	const cn = prop.getParameter('cn');
	const name = typeof cn === 'string' && cn ? cn : email;
	if (!email) return null;
	return { name, email };
}

/** Maps a raw iCal `CATEGORIES` value to a canonical CRM category, or `null`. */
function mapCategory(vevent: ICAL.Component): string | null {
	const raw = vevent.getFirstPropertyValue('categories');
	if (raw == null) return null;
	const key = String(raw).trim().toLowerCase();
	return CATEGORY_MAP[key] ?? null;
}

/** Color derived from the mapped category (never read from ICS). */
function colorFor(category: string | null): string {
	return (category && CATEGORY_COLORS[category]) || DEFAULT_EVENT_COLOR;
}

/**
 * Parses an `.ics` string to a bounded list of {@link CalendarEvent}.
 * Recurring events are expanded to per-occurrence entries within `[start, end)`.
 */
export function parseIcsToEvents(ics: string, range: { start: Date; end: Date }): CalendarEvent[] {
	const { start, end } = range;
	if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
		throw new RangeError('Requested calendar window is too wide');
	}

	const jcal = ICAL.parse(ics);
	const root = new ICAL.Component(jcal);

	// Register any VTIMEZONE blocks so ICAL.Time.toJSDate() resolves TZID instants correctly.
	for (const vtz of root.getAllSubcomponents('vtimezone')) {
		const tzid = vtz.getFirstPropertyValue('tzid');
		if (typeof tzid === 'string' && tzid && !ICAL.TimezoneService.has(tzid)) {
			ICAL.TimezoneService.register(vtz);
		}
	}

	const events: CalendarEvent[] = [];
	const vevents = root.getAllSubcomponents('vevent');
	const rangeStartMs = start.getTime();
	const rangeEndMs = end.getTime();

	for (const vevent of vevents) {
		// SECURITY: strip ATTACH and SOUND before reading any fields.
		vevent.removeAllProperties('attach');
		vevent.removeAllProperties('sound');

		const event = new ICAL.Event(vevent);

		const uid = event.uid ?? '';
		const title = event.summary ?? '';
		const location = (vevent.getFirstPropertyValue('location') as string) ?? null;
		const description = (vevent.getFirstPropertyValue('description') as string) ?? null;
		const status = (vevent.getFirstPropertyValue('status') as string) ?? null;
		const category = mapCategory(vevent);
		const color = colorFor(category);
		const url = (vevent.getFirstPropertyValue('url') as string) ?? null;
		const organizer = parseCalAddress(vevent.getFirstProperty('organizer'));
		const attendees = vevent
			.getAllProperties('attendee')
			.map((p) => parseCalAddress(p))
			.filter((a): a is { name: string; email: string } => a !== null);
		const lastModRaw = vevent.getFirstPropertyValue('last-modified');
		const lastModified =
			lastModRaw && lastModRaw instanceof ICAL.Time ? lastModRaw.toJSDate().toISOString() : null;
		const allDay = event.startDate ? event.startDate.isDate : false;

		const base = {
			uid,
			title,
			allDay,
			location,
			description,
			color,
			status,
			organizer,
			attendees,
			lastModified,
			category,
			url
		};

		if (event.isRecurring()) {
			const durationMs =
				event.endDate && event.startDate
					? event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime()
					: 0;
			const iterator = event.iterator();
			let next: ICAL.Time | null;
			let count = 0;
			while ((next = iterator.next())) {
				const occStartMs = next.toJSDate().getTime();
				if (occStartMs >= rangeEndMs) break; // ordered — no later occurrence is in range
				count += 1;
				if (count > MAX_OCCURRENCES) {
					throw new RangeError('RRULE expands to too many occurrences');
				}
				const occEndMs = occStartMs + durationMs;
				if (occEndMs <= rangeStartMs) continue; // ends before the window opens
				events.push({
					...base,
					start: new Date(occStartMs).toISOString(),
					end: new Date(occEndMs).toISOString()
				});
			}
		} else {
			const startDate = event.startDate ? event.startDate.toJSDate() : null;
			const endDate = event.endDate ? event.endDate.toJSDate() : startDate;
			if (!startDate) continue;
			events.push({
				...base,
				start: startDate.toISOString(),
				end: (endDate ?? startDate).toISOString()
			});
		}
	}

	return events;
}
