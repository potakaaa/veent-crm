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
 * Extracts a CRM deep-link from a DESCRIPTION value (NCAL-2). n8n's ICS builder cannot
 * emit the `URL:` property, so CRM links are embedded as a `CRM-HREF:<path>` line inside
 * DESCRIPTION. Returns the first non-empty href and the remaining description with that
 * line removed. No CRM-HREF line → `url: null` and the description unchanged (behavior-
 * preserving for NCAL-1 events).
 */
function extractCrmHref(description: string | null): {
	url: string | null;
	description: string | null;
} {
	if (description == null) return { url: null, description: null };
	const lines = description.split('\n');
	const idx = lines.findIndex((l) => /^CRM-HREF:(.+)$/.test(l));
	if (idx === -1) return { url: null, description };
	const match = lines[idx].match(/^CRM-HREF:(.+)$/);
	const url = match ? match[1].trim() || null : null;
	if (url == null) return { url: null, description };
	const remaining = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n').trim();
	return { url, description: remaining || null };
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

	let root: ICAL.Component;
	try {
		root = new ICAL.Component(ICAL.parse(ics));
	} catch {
		// Malformed ICS blob — skip silently so one bad entry doesn't abort the whole response.
		return [];
	}

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
		const rawDescription = (vevent.getFirstPropertyValue('description') as string) ?? null;
		const status = (vevent.getFirstPropertyValue('status') as string) ?? null;
		const category = mapCategory(vevent);
		const color = colorFor(category);
		// NCAL-2: derive `url` from a `CRM-HREF:` line inside DESCRIPTION (n8n cannot emit
		// the ICS `URL:` property); strip that line from the returned description.
		const { url, description } = extractCrmHref(rawDescription);
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
				const occEndMs = occStartMs + durationMs;
				if (occEndMs <= rangeStartMs) continue; // ends before the window opens
				count += 1;
				if (count > MAX_OCCURRENCES) {
					throw new RangeError('RRULE expands to too many occurrences');
				}
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
