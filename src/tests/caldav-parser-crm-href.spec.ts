/**
 * Unit tests for the NCAL-2 CRM-HREF extraction in the CalDAV parser (plan step 8).
 *
 * n8n's ICS builder cannot emit the `URL:` property, so CRM deep-links are embedded as a
 * `CRM-HREF:<path>` line inside DESCRIPTION. The parser reads that line back into
 * `event.url` and strips it from the returned `description`. Fixture-driven, deterministic.
 *
 * Scenario ↔ AC map:
 *   CRM-HREF present → url extracted, remaining lines = description   AC1 + AC3
 *   no CRM-HREF → url null, description preserved                     AC2
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIcsToEvents } from '$lib/caldav/parser';

function fixture(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

const JULY = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-08-01T00:00:00Z') };

describe('parseIcsToEvents — CRM-HREF extraction (NCAL-2)', () => {
	it('surfaces a CRM-HREF line in DESCRIPTION as event.url (AC1)', () => {
		const [ev] = parseIcsToEvents(fixture('event-crm-href.ics'), JULY);
		expect(ev.url).toBe('/leads/test-uuid');
	});

	it('strips the CRM-HREF line, leaving the remaining description text (AC3)', () => {
		const [ev] = parseIcsToEvents(fixture('event-crm-href.ics'), JULY);
		// The DESCRIPTION was `CRM-HREF:/leads/test-uuid\nSome notes here` — only the notes remain.
		expect(ev.description).toBe('Some notes here');
	});

	it('yields url=null and preserves description when no CRM-HREF line is present (AC2)', () => {
		const [ev] = parseIcsToEvents(fixture('event-escaped.ics'), JULY);
		expect(ev.url).toBeNull();
		// event-escaped.ics DESCRIPTION decodes to `Line one\nLine two, still going` — unchanged.
		expect(ev.description).toBe('Line one\nLine two, still going');
	});

	it('yields url=null and null description when DESCRIPTION is absent (AC2)', () => {
		const [ev] = parseIcsToEvents(fixture('event-no-categories-no-url.ics'), JULY);
		expect(ev.url).toBeNull();
	});
});
