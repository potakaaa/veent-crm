/**
 * Unit tests for NCAL-4 mapTeamEvents pure function.
 *
 * Proves AC3: team-event merge logic excludes CRM-synced categories (meeting/golive/eventstart)
 * and maps CalendarEvent → CalendarEntry correctly. Manual Nextcloud events (category=null)
 * are included so they appear as purple chips alongside team-event category events.
 * Pure function — no network or DB calls.
 */
import { describe, it, expect } from 'vitest';
import { mapTeamEvents } from '../lib/caldav/team-events';
import type { CalendarEvent } from '$lib/caldav/parser';

const RANGE = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-31T23:59:59Z') };

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

describe('mapTeamEvents — AC3', () => {
	it('returns empty array for empty input', () => {
		expect(mapTeamEvents([], RANGE)).toEqual([]);
	});

	it('filters out CRM-synced categories (meeting, golive, eventstart variants)', () => {
		const events = [
			makeEvent({ category: 'meeting' }),
			makeEvent({ category: 'golive' }),
			makeEvent({ category: 'go-live' }),
			makeEvent({ category: 'eventstart' }),
			makeEvent({ category: 'event-start' })
		];
		expect(mapTeamEvents(events, RANGE)).toHaveLength(0);
	});

	it('includes manual Nextcloud events with category=null', () => {
		const events = [makeEvent({ category: null })];
		expect(mapTeamEvents(events, RANGE)).toHaveLength(1);
	});

	it('keeps events with category === team-event', () => {
		const events = [makeEvent({ category: 'team-event' })];
		const result = mapTeamEvents(events, RANGE);
		expect(result).toHaveLength(1);
	});

	it('maps uid correctly', () => {
		const events = [makeEvent({ uid: 'abc-123' })];
		const [entry] = mapTeamEvents(events, RANGE);
		expect(entry.uid).toBe('abc-123');
		expect(entry.id).toBe('team-event-abc-123');
	});

	it('maps type to team-event', () => {
		const [entry] = mapTeamEvents([makeEvent()], RANGE);
		expect(entry.type).toBe('team-event');
	});

	it('maps title correctly', () => {
		const [entry] = mapTeamEvents([makeEvent({ title: 'Kickoff' })], RANGE);
		expect(entry.title).toBe('Kickoff');
	});

	it('uses fallback title when title is null/undefined', () => {
		// The CalendarEvent type declares title as `string` but the runtime may produce null
		// from ical.js when SUMMARY is absent. `?? '(No title)'` catches null/undefined only;
		// empty string passes through unchanged (valid edge case — caller decides).
		const [entry] = mapTeamEvents([makeEvent({ title: null as unknown as string })], RANGE);
		expect(entry.title).toBe('(No title)');
	});

	it('maps startAt from event.start (ISO string)', () => {
		const [entry] = mapTeamEvents([makeEvent({ start: '2026-07-09T10:00:00.000Z' })], RANGE);
		expect(entry.startAt).toBe('2026-07-09T10:00:00.000Z');
	});

	it('maps url from event.url', () => {
		const [entry] = mapTeamEvents([makeEvent({ url: '/leads/abc-id' })], RANGE);
		expect(entry.url).toBe('/leads/abc-id');
		expect(entry.href).toBe('/leads/abc-id');
	});

	it('uses empty string for href when url is null', () => {
		const [entry] = mapTeamEvents([makeEvent({ url: null })], RANGE);
		expect(entry.href).toBe('');
		expect(entry.url).toBeUndefined();
	});

	it('maps location correctly', () => {
		const [entry] = mapTeamEvents([makeEvent({ location: 'Conference Room B' })], RANGE);
		expect(entry.location).toBe('Conference Room B');
	});

	it('maps description correctly', () => {
		const [entry] = mapTeamEvents([makeEvent({ description: 'Agenda here' })], RANGE);
		expect(entry.description).toBe('Agenda here');
	});

	it('maps status correctly', () => {
		const [entry] = mapTeamEvents([makeEvent({ status: 'confirmed' })], RANGE);
		expect(entry.status).toBe('confirmed');
	});

	it('maps category to categories field', () => {
		const [entry] = mapTeamEvents([makeEvent({ category: 'team-event' })], RANGE);
		expect(entry.categories).toBe('team-event');
	});

	it('handles mixed categories — excludes CRM, includes team-event and null', () => {
		const events = [
			makeEvent({ uid: 'a', category: 'meeting' }),
			makeEvent({ uid: 'b', category: 'team-event' }),
			makeEvent({ uid: 'c', category: 'golive' }),
			makeEvent({ uid: 'd', category: null }),
			makeEvent({ uid: 'e', category: 'eventstart' })
		];
		const result = mapTeamEvents(events, RANGE);
		expect(result).toHaveLength(2);
		expect(result.map((e) => e.uid)).toEqual(['b', 'd']);
	});

	it('sets null fields to undefined in output (no null leakage to CalendarEntry)', () => {
		const [entry] = mapTeamEvents(
			[makeEvent({ location: null, description: null, status: null })],
			RANGE
		);
		expect(entry.location).toBeUndefined();
		expect(entry.description).toBeUndefined();
		expect(entry.status).toBeUndefined();
	});
});
