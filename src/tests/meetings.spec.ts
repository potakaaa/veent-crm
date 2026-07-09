/**
 * Unit tests for the meetings feature (pure functions, no DB).
 *   - meetingFormSchema / meetingUpdateSchema accept valid + reject invalid input
 *   - dbRowToMeeting maps a DB row + attendees -> Meeting
 */
import { describe, it, expect } from 'vitest';
import { meetingFormSchema, meetingUpdateSchema } from '$lib/zod/schemas';
import { dbRowToMeeting, parseMeetingFilterParams } from '$lib/server/db/meetings';
import type { CrmMeeting } from '$lib/server/db/schema';
import type { MeetingAttendee } from '$lib/types';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('meetingFormSchema', () => {
	it('accepts a valid meeting form (with attendees + URL)', () => {
		const r = meetingFormSchema.safeParse({
			leadId: UUID_A,
			startAt: '2026-07-10T14:00:00.000Z',
			organizerId: UUID_B,
			meetingUrl: 'https://meet.example.com/abc',
			notes: 'Kickoff',
			outcome: 'positive',
			attendeeIds: [UUID_B, UUID_C]
		});
		expect(r.success).toBe(true);
	});

	it('defaults attendeeIds to [] and allows omitted optionals', () => {
		const r = meetingFormSchema.safeParse({ leadId: UUID_A, startAt: '2026-07-10T14:00:00Z' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.attendeeIds).toEqual([]);
	});

	it('accepts an empty-string meetingUrl (cleared field)', () => {
		const r = meetingFormSchema.safeParse({
			leadId: UUID_A,
			startAt: '2026-07-10T14:00:00Z',
			meetingUrl: ''
		});
		expect(r.success).toBe(true);
	});

	it('rejects a missing leadId', () => {
		const r = meetingFormSchema.safeParse({ startAt: '2026-07-10T14:00:00Z' });
		expect(r.success).toBe(false);
	});

	it('rejects a non-uuid leadId', () => {
		const r = meetingFormSchema.safeParse({ leadId: 'not-a-uuid', startAt: 'x' });
		expect(r.success).toBe(false);
	});

	it('rejects a non-URL meetingUrl', () => {
		const r = meetingFormSchema.safeParse({
			leadId: UUID_A,
			startAt: 'x',
			meetingUrl: 'not a url'
		});
		expect(r.success).toBe(false);
	});
});

describe('meetingUpdateSchema', () => {
	it('accepts an empty partial (no fields)', () => {
		const r = meetingUpdateSchema.safeParse({});
		expect(r.success).toBe(true);
	});

	it('accepts a partial with only attendeeIds', () => {
		const r = meetingUpdateSchema.safeParse({ attendeeIds: [UUID_B] });
		expect(r.success).toBe(true);
	});

	it('rejects a non-uuid attendee id', () => {
		const r = meetingUpdateSchema.safeParse({ attendeeIds: ['nope'] });
		expect(r.success).toBe(false);
	});

	it('does not accept a leadId (lead is immutable after create)', () => {
		const r = meetingUpdateSchema.safeParse({ leadId: UUID_A });
		// leadId is stripped (unknown key), so parse still succeeds without it.
		expect(r.success).toBe(true);
		if (r.success) expect('leadId' in r.data).toBe(false);
	});
});

describe('dbRowToMeeting', () => {
	function makeRow(overrides: Partial<CrmMeeting> = {}): CrmMeeting {
		return {
			id: UUID_A,
			leadId: UUID_B,
			organizerId: UUID_C,
			leadOrganizerId: null,
			startAt: new Date('2026-07-10T14:00:00.000Z'),
			meetingUrl: 'https://meet.example.com/abc',
			venue: null,
			notes: 'Kickoff',
			outcome: 'positive',
			deletedAt: null,
			dayReminderSentAt: null,
			hourReminderSentAt: null,
			// NCAL-3 — UID storage column (nullable, no default)
			nextcloudUid: null,
			createdAt: new Date('2026-07-01T09:00:00.000Z'),
			updatedAt: new Date('2026-07-01T09:00:00.000Z'),
			...overrides
		};
	}

	it('maps a full row + attendees + organizer + lead name', () => {
		const attendees: MeetingAttendee[] = [{ userId: UUID_C, name: 'Alice' }];
		const m = dbRowToMeeting(makeRow(), attendees, 'Alice', 'Acme Corp');
		expect(m).toEqual({
			id: UUID_A,
			leadId: UUID_B,
			leadName: 'Acme Corp',
			organizerId: UUID_C,
			organizerName: 'Alice',
			leadOrganizerId: null,
			startAt: '2026-07-10T14:00:00.000Z',
			meetingUrl: 'https://meet.example.com/abc',
			notes: 'Kickoff',
			outcome: 'positive',
			attendees,
			createdAt: '2026-07-01T09:00:00.000Z'
		});
	});

	it('maps leadOrganizerId + leadOrganizerName when the lead is linked to an organizer (#188)', () => {
		const m = dbRowToMeeting(
			makeRow({ leadOrganizerId: UUID_B }),
			[],
			null,
			null,
			'Acme Organizers'
		);
		expect(m.leadOrganizerId).toBe(UUID_B);
		expect(m.leadOrganizerName).toBe('Acme Organizers');
	});

	it('defaults leadOrganizerId to null and leadOrganizerName undefined when unset (#188)', () => {
		const m = dbRowToMeeting(makeRow({ leadOrganizerId: null }), []);
		expect(m.leadOrganizerId).toBe(null);
		expect(m.leadOrganizerName).toBeUndefined();
	});

	it('coerces null scalar columns to undefined and null organizer to null', () => {
		const m = dbRowToMeeting(
			makeRow({ organizerId: null, meetingUrl: null, notes: null, outcome: null }),
			[]
		);
		expect(m.organizerId).toBe(null);
		expect(m.organizerName).toBeUndefined();
		expect(m.leadName).toBeUndefined();
		expect(m.meetingUrl).toBeUndefined();
		expect(m.notes).toBeUndefined();
		expect(m.outcome).toBeUndefined();
		expect(m.attendees).toEqual([]);
	});
});

describe('parseMeetingFilterParams', () => {
	const ME = '99999999-9999-4999-8999-999999999999';
	const FOREIGN = '44444444-4444-4444-4444-444444444444';
	const parse = (qs: string) => parseMeetingFilterParams(new URLSearchParams(qs), ME);

	// --- organizer resolution (security-sensitive: 'mine'/absent/junk → meId) ---
	it("resolves 'mine' to the caller id (meId), never a client value", () => {
		expect(parse('organizer=mine').organizerId).toBe(ME);
	});

	it('resolves an ABSENT organizer param to meId (same as mine — the default self-view)', () => {
		expect(parse('').organizerId).toBe(ME);
	});

	it('resolves an empty organizer param to meId', () => {
		expect(parse('organizer=').organizerId).toBe(ME);
	});

	it("maps 'all' to undefined (no organizer condition)", () => {
		expect(parse('organizer=all').organizerId).toBeUndefined();
	});

	it('passes a foreign UUID through as-is (explicit teammate filter)', () => {
		expect(parse(`organizer=${FOREIGN}`).organizerId).toBe(FOREIGN);
	});

	it('falls back non-UUID junk to meId (safe default, NOT undefined)', () => {
		expect(parse('organizer=notauuid').organizerId).toBe(ME);
	});

	// --- lead ---
	it('keeps a valid lead UUID and drops junk', () => {
		expect(parse(`lead=${FOREIGN}`).leadId).toBe(FOREIGN);
		expect(parse('lead=nope').leadId).toBeUndefined();
		expect(parse('').leadId).toBeUndefined();
	});

	// --- sortDir allow-list ---
	it("defaults sortDir to 'desc' for any non-'asc' value", () => {
		expect(parse('sortDir=asc').sortDir).toBe('asc');
		expect(parse('sortDir=desc').sortDir).toBe('desc');
		expect(parse('sortDir=garbage').sortDir).toBe('desc');
		expect(parse('').sortDir).toBe('desc');
	});

	// --- date validation ---
	it('keeps valid YYYY-MM-DD dates and drops invalid ones', () => {
		expect(parse('dateFrom=2026-07-01&dateTo=2026-07-31').dateFrom).toBe('2026-07-01');
		expect(parse('dateFrom=2026-07-01&dateTo=2026-07-31').dateTo).toBe('2026-07-31');
		expect(parse('dateFrom=2026-13-99').dateFrom).toBeUndefined(); // impossible month/day
		expect(parse('dateFrom=07-01-2026').dateFrom).toBeUndefined(); // wrong format
		expect(parse('dateTo=notadate').dateTo).toBeUndefined();
		expect(parse('').dateFrom).toBeUndefined();
	});

	// --- outcome free-text filter ---
	it('trims outcome and treats empty/whitespace-only as undefined', () => {
		expect(parse('outcome=won%20deal').outcome).toBe('won deal');
		expect(parse('outcome=%20%20trimmed%20%20').outcome).toBe('trimmed');
		expect(parse('outcome=').outcome).toBeUndefined();
		expect(parse('outcome=%20%20%20').outcome).toBeUndefined();
		expect(parse('').outcome).toBeUndefined();
	});
});
