/**
 * Unit tests for NCAL-5 classifyCalDavEvents + filterByOwnership.
 *
 * AC2: 💼 and 👥 → meeting, stripped title
 * AC3: 🎟️ with AND without U+FE0F → golive
 * AC4: 🚀 → eventstart
 * AC5: 🎉 → eventstart (user-approved delta from plan); unrecognized → team-event
 * AC6: suffix "— Ticket Sale Start" no-emoji → golive, title unchanged
 * AC7: suffix "— Event Date" no-emoji → eventstart
 * AC8: "Meeting with X" and "Team Meeting" no-emoji → meeting
 * AC10: id format = {type}-{uid}
 * AC11: field mapping (href, url, description, location, status, categories)
 * AC12: rep sees only own lead's entries; no-url entries always shown
 * AC13: manager+filterRepId scoped
 * AC14: manager no filter → all
 * AC15: CATEGORY_COLORS values correct
 */
import { describe, it, expect } from 'vitest';
import { classifyCalDavEvents, filterByOwnership, CATEGORY_COLORS } from '../lib/caldav/classify';
import type { CalendarEvent } from '$lib/caldav/parser';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		uid: 'test-uid-1',
		title: 'Test Event',
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
		category: null,
		url: null,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// AC2: 💼 briefcase → meeting, stripped title
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC2 meeting emoji (💼 👥)', () => {
	it('💼 prefix → type meeting, strips emoji and space from title', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '💼 Meeting with Aria', uid: 'u1' })]);
		expect(entry.type).toBe('meeting');
		expect(entry.title).toBe('Meeting with Aria');
	});

	it('👥 prefix → type meeting, strips emoji and space from title', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '👥 Team Huddle', uid: 'u2' })]);
		expect(entry.type).toBe('meeting');
		expect(entry.title).toBe('Team Huddle');
	});
});

// ---------------------------------------------------------------------------
// AC3: 🎟️ with AND without U+FE0F → golive
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC3 eventstart emoji (🎟️)', () => {
	it('🎟️ with U+FE0F variation selector → golive, stripped title', () => {
		// U+1F39F U+FE0F (admission tickets with variation selector)
		const title = '\u{1F39F}\u{FE0F} Concert Tickets';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u3' })]);
		expect(entry.type).toBe('golive');
		expect(entry.title).toBe('Concert Tickets');
	});

	it('🎟 bare (no U+FE0F) → golive, stripped title', () => {
		// U+1F39F bare (no variation selector)
		const title = '\u{1F39F} Concert Tickets';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u4' })]);
		expect(entry.type).toBe('golive');
		expect(entry.title).toBe('Concert Tickets');
	});

	it('both forms produce the same stripped display title', () => {
		const withFE0F = classifyCalDavEvents([
			makeEvent({ title: '\u{1F39F}\u{FE0F} X', uid: 'a' })
		])[0];
		const withoutFE0F = classifyCalDavEvents([makeEvent({ title: '\u{1F39F} X', uid: 'b' })])[0];
		expect(withFE0F.title).toBe('X');
		expect(withoutFE0F.title).toBe('X');
	});
});

// ---------------------------------------------------------------------------
// AC4: 🚀 → eventstart
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC4 eventstart emoji (🚀)', () => {
	it('🚀 prefix → type eventstart, strips emoji and space from title', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '🚀 Big Launch', uid: 'u5' })]);
		expect(entry.type).toBe('eventstart');
		expect(entry.title).toBe('Big Launch');
	});
});

// ---------------------------------------------------------------------------
// AC5: 🎉 → eventstart (user-approved delta); unrecognized emoji → team-event
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC5 eventstart emoji (🎉) + team-event fallback', () => {
	it('🎉 prefix → type eventstart (user-approved delta from plan), strips emoji and space', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '🎉 Summer Run 2026', uid: 'u6' })]);
		expect(entry.type).toBe('eventstart');
		expect(entry.title).toBe('Summer Run 2026');
	});

	it('unrecognized emoji prefix → team-event, title unchanged', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '🌟 Star Event', uid: 'u7' })]);
		expect(entry.type).toBe('team-event');
		expect(entry.title).toBe('🌟 Star Event');
	});

	it('no emoji, no suffix match → team-event', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: 'Random Event', uid: 'u8' })]);
		expect(entry.type).toBe('team-event');
		expect(entry.title).toBe('Random Event');
	});
});

// ---------------------------------------------------------------------------
// AC6: "Aria Music — Ticket Sale Start" (no emoji) → golive, title unchanged
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC6 suffix golive', () => {
	it('"Aria Music — Ticket Sale Start" → golive, full title unchanged', () => {
		const title = 'Aria Music — Ticket Sale Start';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u9' })]);
		expect(entry.type).toBe('golive');
		expect(entry.title).toBe(title);
	});
});

// ---------------------------------------------------------------------------
// AC7: "Aria Music — Event Date" (no emoji) → eventstart
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC7 suffix eventstart', () => {
	it('"Aria Music — Event Date" → eventstart, full title unchanged', () => {
		const title = 'Aria Music — Event Date';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u10' })]);
		expect(entry.type).toBe('eventstart');
		expect(entry.title).toBe(title);
	});
});

// ---------------------------------------------------------------------------
// AC8: "Meeting with X" and "Team Meeting" (no emoji) → meeting
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC8 suffix meeting', () => {
	it('"Meeting with Aria Music" → meeting, full title unchanged', () => {
		const title = 'Meeting with Aria Music';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u11' })]);
		expect(entry.type).toBe('meeting');
		expect(entry.title).toBe(title);
	});

	it('"Team Meeting" → meeting, full title unchanged', () => {
		const title = 'Team Meeting';
		const [entry] = classifyCalDavEvents([makeEvent({ title, uid: 'u12' })]);
		expect(entry.type).toBe('meeting');
		expect(entry.title).toBe(title);
	});
});

// ---------------------------------------------------------------------------
// AC10: id format = {type}-{uid}
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC10 id format', () => {
	it('id is {type}-{uid}', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ title: '💼 Mtg', uid: 'abc-123' })]);
		expect(entry.id).toBe('meeting-abc-123');
	});
});

// ---------------------------------------------------------------------------
// AC11: field mapping
// ---------------------------------------------------------------------------
describe('classifyCalDavEvents — AC11 field mapping', () => {
	it('maps startAt, href, url, description, location, status, categories, uid', () => {
		const event = makeEvent({
			uid: 'field-uid',
			start: '2026-08-01T09:00:00Z',
			title: '💼 Field Test',
			url: '/leads/lead-x',
			description: 'desc here',
			location: 'BGC',
			status: 'CONFIRMED',
			category: 'meeting'
		});
		const [entry] = classifyCalDavEvents([event]);
		expect(entry.startAt).toBe('2026-08-01T09:00:00Z');
		expect(entry.href).toBe('/leads/lead-x');
		expect(entry.url).toBe('/leads/lead-x');
		expect(entry.description).toBe('desc here');
		expect(entry.location).toBe('BGC');
		expect(entry.status).toBe('CONFIRMED');
		expect(entry.categories).toBe('meeting');
		expect(entry.uid).toBe('field-uid');
	});

	it('sets href to empty string and url to undefined when event.url is null', () => {
		const [entry] = classifyCalDavEvents([makeEvent({ url: null })]);
		expect(entry.href).toBe('');
		expect(entry.url).toBeUndefined();
	});

	it('sets null optional fields to undefined in output', () => {
		const [entry] = classifyCalDavEvents([
			makeEvent({ location: null, description: null, status: null, category: null })
		]);
		expect(entry.location).toBeUndefined();
		expect(entry.description).toBeUndefined();
		expect(entry.status).toBeUndefined();
		expect(entry.categories).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AC15: CATEGORY_COLORS values
// ---------------------------------------------------------------------------
describe('CATEGORY_COLORS — AC15', () => {
	it('meeting → #3b82f6', () => {
		expect(CATEGORY_COLORS['meeting']).toBe('#3b82f6');
	});

	it('golive → #22c55e', () => {
		expect(CATEGORY_COLORS['golive']).toBe('#22c55e');
	});

	it('eventstart → #f59e0b', () => {
		expect(CATEGORY_COLORS['eventstart']).toBe('#f59e0b');
	});

	it('team-event → #8b5cf6', () => {
		expect(CATEGORY_COLORS['team-event']).toBe('#8b5cf6');
	});
});

// ---------------------------------------------------------------------------
// filterByOwnership — AC12/AC13/AC14 + exclusive-default rule
// ---------------------------------------------------------------------------
describe('filterByOwnership', () => {
	const OWNER_MAP = new Map([
		['lead-alice', 'rep-alice'],
		['lead-bob', 'rep-bob']
	]);

	function makeEntry(overrides: Partial<{ id: string; href: string; uid: string }> = {}) {
		return {
			id: overrides.id ?? 'meeting-x',
			type: 'meeting' as const,
			startAt: '2026-08-01T00:00:00Z',
			title: 'Test',
			href: overrides.href ?? '',
			uid: overrides.uid
		};
	}

	// AC12: Rep sees only own leads; no-url entries always shown
	it('AC12: rep sees only their own lead entries', () => {
		const entries = [
			makeEntry({ id: 'a', href: '/leads/lead-alice' }),
			makeEntry({ id: 'b', href: '/leads/lead-bob' }),
			makeEntry({ id: 'c', href: '' }) // no lead URL → always show
		];
		const result = filterByOwnership(entries, {
			userId: 'rep-alice',
			role: 'rep',
			ownerMap: OWNER_MAP
		});
		const ids = result.map((e) => e.id);
		expect(ids).toContain('a'); // alice's lead
		expect(ids).not.toContain('b'); // bob's lead
		expect(ids).toContain('c'); // no URL → always shown
	});

	it('rep: unknown lead (soft-deleted / no owner) → dropped', () => {
		const entries = [makeEntry({ id: 'x', href: '/leads/lead-unknown' })];
		const result = filterByOwnership(entries, {
			userId: 'rep-alice',
			role: 'rep',
			ownerMap: OWNER_MAP
		});
		expect(result).toHaveLength(0);
	});

	// AC13: Manager+filterRepId scoped — no-CRM entries hidden when scoped to a rep
	it("AC13: manager+filterRepId sees only that rep's leads; hides no-CRM entries", () => {
		const entries = [
			makeEntry({ id: 'a', href: '/leads/lead-alice' }),
			makeEntry({ id: 'b', href: '/leads/lead-bob' }),
			makeEntry({ id: 'c', href: '' }) // no CRM link → hidden when filterRepId active
		];
		const result = filterByOwnership(entries, {
			userId: 'mgr-001',
			role: 'manager',
			filterRepId: 'rep-bob',
			ownerMap: OWNER_MAP
		});
		const ids = result.map((e) => e.id);
		expect(ids).not.toContain('a');
		expect(ids).toContain('b');
		expect(ids).not.toContain('c'); // no CRM link → not attributable to the filtered rep
	});

	it('manager+filterRepId: unknown lead → dropped', () => {
		const entries = [makeEntry({ id: 'x', href: '/leads/lead-unknown' })];
		const result = filterByOwnership(entries, {
			userId: 'mgr-001',
			role: 'manager',
			filterRepId: 'rep-bob',
			ownerMap: OWNER_MAP
		});
		expect(result).toHaveLength(0);
	});

	// AC14: Manager no filterRepId → all entries
	it('AC14: manager without filterRepId sees all entries', () => {
		const entries = [
			makeEntry({ id: 'a', href: '/leads/lead-alice' }),
			makeEntry({ id: 'b', href: '/leads/lead-bob' }),
			makeEntry({ id: 'c', href: '/leads/lead-unknown' }), // unknown owner but manager sees all
			makeEntry({ id: 'd', href: '' })
		];
		const result = filterByOwnership(entries, {
			userId: 'mgr-001',
			role: 'manager',
			ownerMap: OWNER_MAP
		});
		expect(result).toHaveLength(4);
	});

	it('super_manager without filterRepId sees all entries', () => {
		const entries = [
			makeEntry({ id: 'a', href: '/leads/lead-alice' }),
			makeEntry({ id: 'b', href: '' })
		];
		const result = filterByOwnership(entries, {
			userId: 'smgr-001',
			role: 'super_manager',
			ownerMap: OWNER_MAP
		});
		expect(result).toHaveLength(2);
	});

	it('no-url entries (team-events) always shown when no filterRepId', () => {
		const entries = [
			makeEntry({ id: 'pub', href: '' }),
			makeEntry({ id: 'pub2', href: '/some-other-path' })
		];
		const result = filterByOwnership(entries, {
			userId: 'rep-alice',
			role: 'rep',
			ownerMap: OWNER_MAP
		});
		expect(result).toHaveLength(2);
	});

	// Meeting ownership via meetingOwnerMap
	const MEETING_MAP = new Map([
		['mtg-alice', 'rep-alice'],
		['mtg-bob', 'rep-bob']
	]);

	it('rep: sees only own meeting entries via meetingOwnerMap', () => {
		const entries = [
			makeEntry({ id: 'm-a', href: '/meetings/mtg-alice' }),
			makeEntry({ id: 'm-b', href: '/meetings/mtg-bob' })
		];
		const result = filterByOwnership(entries, {
			userId: 'rep-alice',
			role: 'rep',
			ownerMap: OWNER_MAP,
			meetingOwnerMap: MEETING_MAP
		});
		expect(result.map((e) => e.id)).toEqual(['m-a']);
	});

	it("manager+filterRepId: sees only that rep's meetings", () => {
		const entries = [
			makeEntry({ id: 'm-a', href: '/meetings/mtg-alice' }),
			makeEntry({ id: 'm-b', href: '/meetings/mtg-bob' }),
			makeEntry({ id: 'nc', href: '' }) // no CRM link → hidden
		];
		const result = filterByOwnership(entries, {
			userId: 'mgr-001',
			role: 'manager',
			filterRepId: 'rep-bob',
			ownerMap: OWNER_MAP,
			meetingOwnerMap: MEETING_MAP
		});
		const ids = result.map((e) => e.id);
		expect(ids).toEqual(['m-b']);
	});

	it('manager without filterRepId: sees all meetings', () => {
		const entries = [
			makeEntry({ id: 'm-a', href: '/meetings/mtg-alice' }),
			makeEntry({ id: 'm-b', href: '/meetings/mtg-bob' }),
			makeEntry({ id: 'm-u', href: '/meetings/mtg-unknown' }) // unknown organizer → still shown
		];
		const result = filterByOwnership(entries, {
			userId: 'mgr-001',
			role: 'manager',
			ownerMap: OWNER_MAP,
			meetingOwnerMap: MEETING_MAP
		});
		expect(result).toHaveLength(3);
	});
});
