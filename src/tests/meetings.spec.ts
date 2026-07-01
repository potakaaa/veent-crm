/**
 * Unit tests for the meetings feature (pure functions, no DB).
 *   - meetingFormSchema / meetingUpdateSchema accept valid + reject invalid input
 *   - dbRowToMeeting maps a DB row + attendees -> Meeting
 */
import { describe, it, expect } from 'vitest';
import { meetingFormSchema, meetingUpdateSchema } from '$lib/zod/schemas';
import { dbRowToMeeting } from '$lib/server/db/meetings';
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
		const r = meetingFormSchema.safeParse({ leadId: UUID_A, startAt: 'x', meetingUrl: '' });
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
			startAt: new Date('2026-07-10T14:00:00.000Z'),
			meetingUrl: 'https://meet.example.com/abc',
			notes: 'Kickoff',
			outcome: 'positive',
			deletedAt: null,
			dayReminderSentAt: null,
			hourReminderSentAt: null,
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
			startAt: '2026-07-10T14:00:00.000Z',
			meetingUrl: 'https://meet.example.com/abc',
			notes: 'Kickoff',
			outcome: 'positive',
			attendees,
			createdAt: '2026-07-01T09:00:00.000Z'
		});
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
