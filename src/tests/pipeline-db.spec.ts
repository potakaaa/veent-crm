/**
 * DB integration tests for Phase 5 — moveLeadStage and reassignLead.
 *
 * Prerequisites:
 *   1. docker compose up -d db   (postgres service)
 *   2. bun run db:push            (apply schema migrations)
 *   3. bun run db:seed            (insert crm_users rows — provides MANAGER_UUID + REP_UUID)
 *
 * Tests are skipped when DATABASE_URL is not set (CI without a postgres service).
 * To run locally: ensure DATABASE_URL is in .env, then: bun run test:unit -- --run
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createLead, getLead, moveLeadStage, reassignLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Lead } from '$lib/types';

// Skip when no DATABASE_URL is configured (no postgres service available).
const SKIP_DB = !process.env.DATABASE_URL;

// Seeded manager + rep UUIDs — inserted by scripts/seed.ts (db:seed).
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const REP_UUID = '00000000-0000-0000-0000-000000000002';

const TEST_PREFIX = '__p5test__';
const createdIds: string[] = [];

afterAll(async () => {
	for (const id of createdIds) {
		await db.delete(crmLeads).where(eq(crmLeads.id, id));
	}
});

// ---------------------------------------------------------------------------
// moveLeadStage — regular transitions
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('moveLeadStage — regular transitions', () => {
	it('moves a lead to contacted and persists to DB', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Stage Move` }, MANAGER_UUID);
		createdIds.push(lead.id);

		const updated = await moveLeadStage(lead.id, 'contacted', {}, MANAGER_UUID, 'manager');
		expect(updated).not.toBeNull();
		expect((updated as Lead).stage).toBe('contacted');

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched!.stage).toBe('contacted');
	});

	it('returns null for a nonexistent lead ID', async () => {
		const result = await moveLeadStage(
			'00000000-0000-0000-0000-ffffffffffff',
			'contacted',
			{},
			MANAGER_UUID,
			'manager'
		);
		expect(result).toBeNull();
	});

	it('returns null for a soft-deleted lead', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Deleted Stage` }, MANAGER_UUID);
		createdIds.push(lead.id);
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));

		const result = await moveLeadStage(lead.id, 'contacted', {}, MANAGER_UUID, 'manager');
		expect(result).toBeNull();
	});

	it('writes a stage history row on transition', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} History Check` }, MANAGER_UUID);
		createdIds.push(lead.id);

		await moveLeadStage(lead.id, 'replied', {}, MANAGER_UUID, 'manager');

		const history = await db
			.select()
			.from(crmLeadHistory)
			.where(eq(crmLeadHistory.leadId, lead.id));

		const stageRow = history.find((h) => h.field === 'stage');
		expect(stageRow).toBeDefined();
		expect(stageRow!.oldValue).toBe('new');
		expect(stageRow!.newValue).toBe('replied');
		expect(stageRow!.actorUserId).toBe(MANAGER_UUID);
	});
});

// ---------------------------------------------------------------------------
// moveLeadStage — won capture
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('moveLeadStage — won capture', () => {
	it('marks a lead won with deal value and persists all won fields', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Won Lead` }, MANAGER_UUID);
		createdIds.push(lead.id);

		const updated = await moveLeadStage(
			lead.id,
			'won',
			{
				wonOrgName: 'Big Events Co.',
				dealValueCents: 5000000,
				currency: 'PHP',
				signedAt: '2026-06-29'
			},
			MANAGER_UUID,
			'manager'
		);

		expect(updated).not.toBeNull();
		expect((updated as Lead).stage).toBe('won');
		expect((updated as Lead).signedOrg).toBe('Big Events Co.');
		expect((updated as Lead).dealValue).toBe(50000); // 5000000 cents / 100
		expect((updated as Lead).currency).toBe('PHP');
	});

	it('writes stage + won_org_name + deal_value_cents history rows', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Won History` }, MANAGER_UUID);
		createdIds.push(lead.id);

		await moveLeadStage(
			lead.id,
			'won',
			{ wonOrgName: 'Org A', dealValueCents: 1000000 },
			MANAGER_UUID,
			'manager'
		);

		const history = await db
			.select()
			.from(crmLeadHistory)
			.where(eq(crmLeadHistory.leadId, lead.id));

		expect(history.find((h) => h.field === 'stage')).toBeDefined();
		expect(history.find((h) => h.field === 'won_org_name')?.newValue).toBe('Org A');
		expect(history.find((h) => h.field === 'deal_value_cents')?.newValue).toBe('1000000');
	});

	it('marks won without a deal value (optional fields)', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Won No Value` }, MANAGER_UUID);
		createdIds.push(lead.id);

		const updated = await moveLeadStage(lead.id, 'won', {}, MANAGER_UUID, 'manager');
		expect(updated).not.toBeNull();
		expect((updated as Lead).stage).toBe('won');
		expect((updated as Lead).dealValue).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// moveLeadStage — lost
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('moveLeadStage — lost', () => {
	it('marks a lead lost with a reason', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Lost Lead` }, MANAGER_UUID);
		createdIds.push(lead.id);

		const updated = await moveLeadStage(
			lead.id,
			'lost',
			{ lostReason: 'no_response' },
			MANAGER_UUID,
			'manager'
		);
		expect(updated).not.toBeNull();
		expect((updated as Lead).stage).toBe('lost');
		expect((updated as Lead).lostReason).toBe('no_response');
	});

	it('writes stage + lost_reason history rows', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Lost History` }, MANAGER_UUID);
		createdIds.push(lead.id);

		await moveLeadStage(lead.id, 'lost', { lostReason: 'rejected' }, MANAGER_UUID, 'manager');

		const history = await db
			.select()
			.from(crmLeadHistory)
			.where(eq(crmLeadHistory.leadId, lead.id));

		expect(history.find((h) => h.field === 'stage')?.newValue).toBe('lost');
		expect(history.find((h) => h.field === 'lost_reason')?.newValue).toBe('rejected');
	});
});

// ---------------------------------------------------------------------------
// reassignLead
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('reassignLead', () => {
	it('changes the owner and persists to DB', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Reassign` }, MANAGER_UUID);
		createdIds.push(lead.id);
		expect(lead.ownerId).toBe(MANAGER_UUID);

		const updated = await reassignLead(lead.id, REP_UUID, MANAGER_UUID);
		expect(updated).not.toBeNull();
		expect(updated!.ownerId).toBe(REP_UUID);

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched!.ownerId).toBe(REP_UUID);
	});

	it('writes an owner_id history row', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Reassign History` }, MANAGER_UUID);
		createdIds.push(lead.id);

		await reassignLead(lead.id, REP_UUID, MANAGER_UUID);

		const history = await db
			.select()
			.from(crmLeadHistory)
			.where(eq(crmLeadHistory.leadId, lead.id));

		const ownerRow = history.find((h) => h.field === 'owner_id');
		expect(ownerRow).toBeDefined();
		expect(ownerRow!.oldValue).toBe(MANAGER_UUID);
		expect(ownerRow!.newValue).toBe(REP_UUID);
	});

	it('returns null for a nonexistent lead', async () => {
		const result = await reassignLead(
			'00000000-0000-0000-0000-ffffffffffff',
			REP_UUID,
			MANAGER_UUID
		);
		expect(result).toBeNull();
	});

	it('returns null for a soft-deleted lead', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Deleted Reassign` }, MANAGER_UUID);
		createdIds.push(lead.id);
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));

		const result = await reassignLead(lead.id, REP_UUID, MANAGER_UUID);
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Phase 4 regression — existing reads still work after Phase 5 changes
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('Phase 4 regression — reads unaffected', () => {
	it('createLead + getLead still round-trips correctly', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Regression P4` }, MANAGER_UUID);
		createdIds.push(lead.id);

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched).not.toBeNull();
		expect(fetched!.name).toBe(`${TEST_PREFIX} Regression P4`);
		expect(fetched!.stage).toBe('new');
	});
});
