/**
 * Unit tests for NCAL-5 classifyCalDavEvents field mapping.
 *
 * Updated from NCAL-4 mapTeamEvents tests: classifyCalDavEvents replaces mapTeamEvents.
 * Unlike mapTeamEvents, classifyCalDavEvents does NOT filter events by category — it
 * classifies all events by emoji prefix / suffix pattern. Coverage here focuses on field
 * mapping (the behaviors that survived the rewrite) and the new emoji classification.
 * Full emoji classification tests live in caldav-classify.spec.ts.
 *
 * Pure function — no network or DB calls.
 */
import { describe, it, expect } from 'vitest';
import { classifyCalDavEvents } from '../lib/caldav/classify';
import type { CalendarEvent } from '$lib/caldav/parser';

const RANGE = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-31T23:59:59Z') };
void RANGE; // retained for historical context; classifyCalDavEvents does not use range

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		uid: 'test-uid-1',
		title: 'Test Team Event',
		start: '2026-07-09T10:00:00.000Z',
		end: '2026-07-09T11:00:00.000Z',
		allDay: false,
		location: null,
		description: null,
		color: '#8b5cf6',
		status: null,
		organizer: null,
		attendees: [],
		lastModified: null,
		category: 'team-event',
		url: null,
		...overrides
	};
}

describe('classifyCalDavEvents — field mapping (replaces mapTeamEvents AC3)', () => {
	it('returns empty array for empty input', () => {
		expect(classifyCalDavEvents([])).toEqual([]);
	});

	it('classifies all events (does not filter by category)', () => {
		// classifyCalDavEvents no longer excludes CRM-synced categories.
		// Events with title matching emoji or suffix get a typed entry; others get team-event.
		const events = [
			makeEvent({ uid: 'a', category: 'meeting', title: '💼 Mtg' }),
			makeEvent({ uid: 'b', category: 'golive', title: '🎟 TKT' }),
			makeEvent({ uid: 'c', category: 'eventstart', title: '🚀 Launch' }),
			makeEvent({ uid: 'd', category: null, title: 'Plain event' }),
			makeEvent({ uid: 'e', category: 'team-event', title: 'Team event' })
		];
		expect(classifyCalDavEvents(events)).toHaveLength(5);
	});

	it('maps uid correctly', () => {
		const events = [makeEvent({ uid: 'abc-123', title: 'Test Team Event' })];
		const [entry] = classifyCalDavEvents(events);
		expect(entry.uid).toBe('abc-123');
		expect(entry.id).toBe('team-event-abc-123');
	});

	it('maps type to team-event for unrecognized title', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: 'Test Team Event' })]);
		expect(entry.type).toBe('team-event');
	});

	it('maps title correctly (no emoji prefix → unchanged)', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: 'Kickoff' })]);
		expect(entry.title).toBe('Kickoff');
	});

	it('uses fallback title when title is null/undefined', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: null as unknown as string })]);
		expect(entry.title).toBe('(No title)');
	});

	it('maps startAt from event.start (ISO string)', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ start: '2026-07-09T10:00:00.000Z' })]);
		expect(entry.startAt).toBe('2026-07-09T10:00:00.000Z');
	});

	it('maps url from event.url', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ url: '/leads/abc-id' })]);
		expect(entry.url).toBe('/leads/abc-id');
		expect(entry.href).toBe('/leads/abc-id');
	});

	it('uses empty string for href when url is null', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ url: null })]);
		expect(entry.href).toBe('');
		expect(entry.url).toBeUndefined();
	});

	it('maps location correctly', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ location: 'Conference Room B' })]);
		expect(entry.location).toBe('Conference Room B');
	});

	it('maps description correctly', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ description: 'Agenda here' })]);
		expect(entry.description).toBe('Agenda here');
	});

	it('maps status correctly', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ status: 'confirmed' })]);
		expect(entry.status).toBe('confirmed');
	});

	it('maps category to categories field', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ category: 'team-event' })]);
		expect(entry.categories).toBe('team-event');
	});

	it('sets null fields to undefined in output (no null leakage to CalendarEntry)', () => {
		const [entry] = classifyCalDavEvents([
			makeEvent({ location: null, description: null, status: null })
		]);
		expect(entry.location).toBeUndefined();
		expect(entry.description).toBeUndefined();
		expect(entry.status).toBeUndefined();
	});
});
