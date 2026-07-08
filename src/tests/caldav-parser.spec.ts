/**
 * Unit tests for the CalDAV `.ics` → CalendarEvent[] parser (NCAL-1, plan step 7).
 *
 * Fixture-driven, deterministic, no network/DB. Every test asserts (vitest
 * requireAssertions is on globally). Proves: folded-line unwrap, `\n`/`\,` escape
 * decode, VTIMEZONE instant resolution, all-day (VALUE=DATE) detection, RRULE
 * expansion within window, RRULE across a DST boundary, CATEGORIES/URL mapping,
 * and ATTACH/SOUND stripping.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIcsToEvents } from '$lib/caldav/parser';

function fixture(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

const JULY = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-08-01T00:00:00Z') };
const MARCH_2025 = {
	start: new Date('2025-03-01T00:00:00Z'),
	end: new Date('2025-04-01T00:00:00Z')
};

describe('parseIcsToEvents', () => {
	it('unwraps RFC-5545 folded lines into a single continuous title', () => {
		const [ev] = parseIcsToEvents(fixture('event-folded.ics'), JULY);
		expect(ev.title).toBe(
			'This is a very long meeting title that has been folded across multiple physical lines per RFC 5545 line folding rules to exceed seventy five chars'
		);
	});

	it('decodes escaped \\n and \\, in SUMMARY and DESCRIPTION', () => {
		const [ev] = parseIcsToEvents(fixture('event-escaped.ics'), JULY);
		expect(ev.title).toBe('Escaped, title');
		expect(ev.description).toBe('Line one\nLine two, still going');
	});

	it('resolves a VTIMEZONE block to the correct absolute UTC instant', () => {
		const [ev] = parseIcsToEvents(fixture('event-vtimezone.ics'), JULY);
		// 10:00 Asia/Manila (UTC+8) == 02:00Z
		expect(ev.start).toBe('2026-07-01T02:00:00.000Z');
		expect(ev.end).toBe('2026-07-01T03:00:00.000Z');
	});

	it('marks a VALUE=DATE DTSTART as allDay', () => {
		const [ev] = parseIcsToEvents(fixture('event-allday.ics'), JULY);
		expect(ev.allDay).toBe(true);
	});

	it('expands an RRULE to the expected occurrence count within the window', () => {
		const events = parseIcsToEvents(fixture('event-rrule.ics'), JULY);
		expect(events).toHaveLength(3);
		expect(events.map((e) => e.start)).toEqual([
			'2026-07-06T14:00:00.000Z',
			'2026-07-13T14:00:00.000Z',
			'2026-07-20T14:00:00.000Z'
		]);
	});

	it('expands an RRULE crossing a DST boundary to the correct shifted instants', () => {
		const events = parseIcsToEvents(fixture('event-rrule-dst.ics'), MARCH_2025);
		expect(events).toHaveLength(3);
		// 2025-03-06 09:00 EST (UTC-5) -> 14:00Z; after spring-forward 2025-03-09,
		// 03-13 & 03-20 are 09:00 EDT (UTC-4) -> 13:00Z. A naive fixed-offset expansion
		// would wrongly keep 14:00Z for all three.
		expect(events.map((e) => e.start)).toEqual([
			'2025-03-06T14:00:00.000Z',
			'2025-03-13T13:00:00.000Z',
			'2025-03-20T13:00:00.000Z'
		]);
	});

	it('maps CATEGORIES to category and URL to url, with organizer/attendees', () => {
		const [ev] = parseIcsToEvents(fixture('event-categories-url.ics'), JULY);
		expect(ev.category).toBe('meeting');
		expect(ev.url).toBe('/meetings/abc-123');
		expect(ev.color).toBe('#3b82f6');
		expect(ev.status).toBe('CONFIRMED');
		expect(ev.organizer).toEqual({ name: 'Jane Rep', email: 'jane@veent.io' });
		expect(ev.attendees).toEqual([{ name: 'Bob Lead', email: 'bob@example.com' }]);
		expect(ev.lastModified).toBe('2026-07-01T12:00:00.000Z');
	});

	it('yields category=null and url=null when CATEGORIES/URL are absent', () => {
		const [ev] = parseIcsToEvents(fixture('event-no-categories-no-url.ics'), JULY);
		expect(ev.category).toBeNull();
		expect(ev.url).toBeNull();
		expect(ev.attendees).toEqual([]);
		expect(ev.organizer).toBeNull();
	});

	it('strips ATTACH and SOUND — neither appears on the returned event', () => {
		const [ev] = parseIcsToEvents(fixture('event-no-categories-no-url.ics'), JULY);
		const serialized = JSON.stringify(ev);
		expect(serialized).not.toContain('secret-attachment');
		expect(serialized).not.toContain('Basso');
		expect(Object.keys(ev)).not.toContain('attach');
		expect(Object.keys(ev)).not.toContain('sound');
	});
});
