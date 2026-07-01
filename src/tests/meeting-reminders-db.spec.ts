/**
 * Hybrid (DB-optional) integration tests for meeting reminders.
 *
 * Prerequisites:
 *   docker compose up -d db && bun run db:push && bun run db:seed
 *
 * Skipped when DATABASE_URL is not set (no postgres service in CI — repo-wide known gap;
 * mirrors reminders-db.spec.ts). To run locally: ensure DATABASE_URL is in .env, then
 *   bun run test:unit:ci
 *
 * Covers (Hybrid gates):
 *   - due-query window filtering with injectable `now` (day ~24h / hour ~1h / past / deleted)
 *   - atomic mark-sent race: poll-twice-concurrently -> exactly one winner
 */
import { describe, it, expect, afterAll } from 'vitest';
import { getDueMeetingReminders, markMeetingReminderSent } from '$lib/server/db/meeting-reminders';
import { db } from '$lib/server/db/index';
import { crmLeads, crmMeetings } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;

// Seeded manager UUID from scripts/seed.ts (an active user with an email)
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const TEST_PREFIX = '__mrtest__';
const HOUR = 3_600_000;

const createdLeadIds: string[] = [];
const createdMeetingIds: string[] = [];

afterAll(async () => {
	if (createdMeetingIds.length > 0) {
		// attendees cascade-delete via meeting FK; delete meetings explicitly.
		await db.delete(crmMeetings).where(inArray(crmMeetings.id, createdMeetingIds));
	}
	if (createdLeadIds.length > 0) {
		await db.delete(crmLeads).where(inArray(crmLeads.id, createdLeadIds));
	}
});

async function makeLead(name: string): Promise<string> {
	const [lead] = await db
		.insert(crmLeads)
		.values({ name: `${TEST_PREFIX} ${name}`, category: 'Sports' })
		.returning({ id: crmLeads.id });
	createdLeadIds.push(lead.id);
	return lead.id;
}

async function makeMeeting(opts: {
	leadId: string;
	startAt: Date;
	organizerId?: string | null;
	deletedAt?: Date | null;
}): Promise<string> {
	const [m] = await db
		.insert(crmMeetings)
		.values({
			leadId: opts.leadId,
			startAt: opts.startAt,
			organizerId: opts.organizerId ?? MANAGER_UUID,
			deletedAt: opts.deletedAt ?? null
		})
		.returning({ id: crmMeetings.id });
	createdMeetingIds.push(m.id);
	return m.id;
}

describe.skipIf(SKIP_DB)('getDueMeetingReminders — window filtering (DB)', () => {
	it('day checkpoint: a meeting ~20h out (within 24h, beyond 1h) is due for day only', async () => {
		const now = new Date();
		const leadId = await makeLead('DayOut');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + 20 * HOUR) });

		const due = await getDueMeetingReminders(now);
		const mine = due.filter((d) => d.meetingId === meetingId);
		expect(mine.map((d) => d.checkpoint)).toEqual(['day']);
	});

	it('hour checkpoint: a meeting ~30m out (within 1h) is due for BOTH hour and day windows', async () => {
		const now = new Date();
		const leadId = await makeLead('HourOut');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + HOUR / 2) });

		const due = await getDueMeetingReminders(now);
		const cps = due
			.filter((d) => d.meetingId === meetingId)
			.map((d) => d.checkpoint)
			.sort();
		// ~30m out is <= now+1h AND <= now+24h, and > now, so it satisfies both checkpoint windows.
		expect(cps).toEqual(['day', 'hour']);
	});

	it('past meeting (startAt < now) is excluded', async () => {
		const now = new Date();
		const leadId = await makeLead('PastMeeting');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() - HOUR) });

		const due = await getDueMeetingReminders(now);
		expect(due.find((d) => d.meetingId === meetingId)).toBeUndefined();
	});

	it('far-future meeting (>24h out) is excluded from both windows', async () => {
		const now = new Date();
		const leadId = await makeLead('FarFuture');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + 48 * HOUR) });

		const due = await getDueMeetingReminders(now);
		expect(due.find((d) => d.meetingId === meetingId)).toBeUndefined();
	});

	it('soft-deleted meeting is excluded', async () => {
		const now = new Date();
		const leadId = await makeLead('DeletedMeeting');
		const meetingId = await makeMeeting({
			leadId,
			startAt: new Date(now.getTime() + 20 * HOUR),
			deletedAt: new Date()
		});

		const due = await getDueMeetingReminders(now);
		expect(due.find((d) => d.meetingId === meetingId)).toBeUndefined();
	});

	it('already-sent day checkpoint is excluded from the day window', async () => {
		const now = new Date();
		const leadId = await makeLead('AlreadySentDay');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + 20 * HOUR) });
		await markMeetingReminderSent(meetingId, 'day');

		const due = await getDueMeetingReminders(now);
		expect(due.find((d) => d.meetingId === meetingId && d.checkpoint === 'day')).toBeUndefined();
	});
});

describe.skipIf(SKIP_DB)('markMeetingReminderSent — atomic race (DB)', () => {
	it('poll-twice concurrently: exactly one caller wins (at-most-once send)', async () => {
		const now = new Date();
		const leadId = await makeLead('RaceMeeting');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + 20 * HOUR) });

		// Two concurrent mark-sent calls for the same checkpoint — Postgres row-lock must
		// let exactly one flip NULL->timestamp; the other gets zero rows.
		const [a, b] = await Promise.all([
			markMeetingReminderSent(meetingId, 'day'),
			markMeetingReminderSent(meetingId, 'day')
		]);
		expect([a, b].filter(Boolean)).toHaveLength(1);

		// A third, later call also loses (already sent).
		const third = await markMeetingReminderSent(meetingId, 'day');
		expect(third).toBe(false);
	});

	it('day and hour checkpoints are independent (marking day leaves hour winnable)', async () => {
		const now = new Date();
		const leadId = await makeLead('IndependentCheckpoints');
		const meetingId = await makeMeeting({ leadId, startAt: new Date(now.getTime() + 20 * HOUR) });

		expect(await markMeetingReminderSent(meetingId, 'day')).toBe(true);
		expect(await markMeetingReminderSent(meetingId, 'hour')).toBe(true);
	});
});
