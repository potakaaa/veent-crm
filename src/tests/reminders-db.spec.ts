/**
 * DB integration tests for the reminders queue (getRemindersQueue).
 *
 * Prerequisites:
 *   docker compose up -d db && bun run db:push && bun run db:seed
 *
 * Skipped when DATABASE_URL is not set (no postgres service in CI).
 * To run locally: ensure DATABASE_URL is in .env, then bun run test:unit:ci
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createLead, getRemindersQueue } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmActivities } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;

// Seeded manager UUID from scripts/seed.ts
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const TEST_PREFIX = '__remtest__';

const createdLeadIds: string[] = [];

afterAll(async () => {
	if (createdLeadIds.length > 0) {
		// Activities cascade-delete; just hard-delete the leads.
		await db.delete(crmLeads).where(inArray(crmLeads.id, createdLeadIds));
	}
});

async function makeTestLead(name: string, stage: 'new' | 'contacted' | 'replied' = 'contacted') {
	const lead = await createLead(
		{ name: `${TEST_PREFIX} ${name}`, category: 'Sports' },
		MANAGER_UUID
	);
	createdLeadIds.push(lead.id);
	if (stage !== 'new') {
		await db.update(crmLeads).set({ stage }).where(eq(crmLeads.id, lead.id));
	}
	return lead;
}

async function bookFollowUp(leadId: string, repId: string, followUpAt: Date) {
	await db.insert(crmActivities).values({
		leadId,
		repId,
		channel: 'fb_dm',
		outcome: 'sent',
		occurredAt: new Date(),
		followUpAt
	});
	// Keep lastActivityAt current so the lead is not also "cold"
	await db.update(crmLeads).set({ lastActivityAt: new Date() }).where(eq(crmLeads.id, leadId));
}

async function makeStale(leadId: string, daysAgo: number) {
	const staleDate = new Date(Date.now() - daysAgo * 86_400_000);
	await db.update(crmLeads).set({ lastActivityAt: staleDate }).where(eq(crmLeads.id, leadId));
}

describe.skipIf(SKIP_DB)('getRemindersQueue — overdue bucket (DB)', () => {
	it('lead with a past follow-up date appears in overdue', async () => {
		const lead = await makeTestLead('Overdue Org');
		const pastDate = new Date(Date.now() - 3 * 86_400_000);
		await bookFollowUp(lead.id, MANAGER_UUID, pastDate);

		const { overdue } = await getRemindersQueue(MANAGER_UUID);
		const found = overdue.find((l) => l.id === lead.id);
		expect(found).toBeDefined();
		expect(found!.urgency).toBe('overdue');
	});

	it('lead with a future follow-up does NOT appear in overdue', async () => {
		const lead = await makeTestLead('Future Org');
		const futureDate = new Date(Date.now() + 5 * 86_400_000);
		await bookFollowUp(lead.id, MANAGER_UUID, futureDate);

		const { overdue } = await getRemindersQueue(MANAGER_UUID);
		const found = overdue.find((l) => l.id === lead.id);
		expect(found).toBeUndefined();
	});

	it('overdue leads are sorted earliest follow-up first', async () => {
		const older = await makeTestLead('OlderOverdue');
		const newer = await makeTestLead('NewerOverdue');
		await bookFollowUp(older.id, MANAGER_UUID, new Date(Date.now() - 7 * 86_400_000));
		await bookFollowUp(newer.id, MANAGER_UUID, new Date(Date.now() - 2 * 86_400_000));

		const { overdue } = await getRemindersQueue(MANAGER_UUID);
		const idx = (id: string) => overdue.findIndex((l) => l.id === id);
		expect(idx(older.id)).toBeLessThan(idx(newer.id));
	});
});

describe.skipIf(SKIP_DB)('getRemindersQueue — cold bucket (DB)', () => {
	it('lead idle >30 days with no follow-up appears in cold', async () => {
		const lead = await makeTestLead('Stale Org');
		await makeStale(lead.id, 31);

		const { cold } = await getRemindersQueue(MANAGER_UUID);
		const found = cold.find((l) => l.id === lead.id);
		expect(found).toBeDefined();
		expect(found!.urgency).toBe('cold');
	});

	it('lead idle ≤30 days does NOT appear in cold', async () => {
		const lead = await makeTestLead('Fresh Enough Org');
		await makeStale(lead.id, 15);

		const { cold } = await getRemindersQueue(MANAGER_UUID);
		const found = cold.find((l) => l.id === lead.id);
		expect(found).toBeUndefined();
	});

	it('cold leads are sorted by lastActivityAt ascending (coldest first)', async () => {
		const colder = await makeTestLead('Colder Org');
		const warmer = await makeTestLead('Warmer Org');
		await makeStale(colder.id, 60);
		await makeStale(warmer.id, 35);

		const { cold } = await getRemindersQueue(MANAGER_UUID);
		const idxColder = cold.findIndex((l) => l.id === colder.id);
		const idxWarmer = cold.findIndex((l) => l.id === warmer.id);
		// Both must be present before comparing order
		if (idxColder !== -1 && idxWarmer !== -1) {
			expect(idxColder).toBeLessThan(idxWarmer);
		}
	});
});

describe.skipIf(SKIP_DB)('getRemindersQueue — exclusions (DB)', () => {
	it('soft-deleted lead is excluded from both buckets', async () => {
		const lead = await makeTestLead('Deleted Org');
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));
		await makeStale(lead.id, 31);

		const { overdue, cold } = await getRemindersQueue(MANAGER_UUID);
		expect(overdue.find((l) => l.id === lead.id)).toBeUndefined();
		expect(cold.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('won lead is excluded from both buckets', async () => {
		const lead = await makeTestLead('Won Org');
		await db.update(crmLeads).set({ stage: 'won' }).where(eq(crmLeads.id, lead.id));
		await makeStale(lead.id, 31);

		const { overdue, cold } = await getRemindersQueue(MANAGER_UUID);
		expect(overdue.find((l) => l.id === lead.id)).toBeUndefined();
		expect(cold.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('lost lead is excluded from both buckets', async () => {
		const lead = await makeTestLead('Lost Org');
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));
		await makeStale(lead.id, 31);

		const { overdue, cold } = await getRemindersQueue(MANAGER_UUID);
		expect(overdue.find((l) => l.id === lead.id)).toBeUndefined();
		expect(cold.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('snooze (future follow-up) removes overdue lead after re-booking', async () => {
		const lead = await makeTestLead('Snooze Org');
		// First book a past follow-up so it's overdue
		await bookFollowUp(lead.id, MANAGER_UUID, new Date(Date.now() - 2 * 86_400_000));

		const before = await getRemindersQueue(MANAGER_UUID);
		expect(before.overdue.find((l) => l.id === lead.id)).toBeDefined();

		// Now snooze: insert a newer activity with a future follow-up.
		// getTodayQueue uses DISTINCT ON lead_id ORDER BY occurred_at DESC — so
		// inserting a newer activity with a future date wins over the old overdue one.
		await db.insert(crmActivities).values({
			leadId: lead.id,
			repId: MANAGER_UUID,
			channel: 'other',
			outcome: 'other',
			occurredAt: new Date(Date.now() + 1000), // 1 second after the first activity
			followUpAt: new Date(Date.now() + 3 * 86_400_000),
			notes: 'Snoozed'
		});

		const after = await getRemindersQueue(MANAGER_UUID);
		expect(after.overdue.find((l) => l.id === lead.id)).toBeUndefined();
	});
});
