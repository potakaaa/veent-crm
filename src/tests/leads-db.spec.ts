/**
 * DB integration tests for Phase 4 — requires the docker postgres container to be running.
 * Run: docker compose up -d db && bun run test:unit:ci
 *
 * Skipped automatically in CI (process.env.CI === 'true') because GitHub Actions has no
 * postgres service. To run locally: docker compose up -d db && bun run test:unit:ci
 *
 * Tests the actual Drizzle query layer (createLead / getLead / listLeads).
 * Auth is bypassed — these tests call DB functions directly, not via HTTP.
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	createLead,
	getLead,
	listLeads,
	updateLead,
	claimLead,
	unclaimLead,
	reassignLead,
	getLeadVisibilityGrants
} from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Skip when DATABASE_URL is not set (no postgres service available).
// Locally (docker compose up -d db + DATABASE_URL in .env), all tests run normally.
// Precondition for the visibility cases below: `bun run db:push` must have applied the
// crm_lead_visibility_grants junction table + crm_leads.visibility column first.
const SKIP_DB = !process.env.DATABASE_URL;

// Seeded manager + rep UUIDs (from scripts/seed.ts — must be present for FK to pass)
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const REP_UUID = '00000000-0000-0000-0000-000000000002';
// A user id NOT permitted to see a restricted lead. getLead does not FK the querying user,
// so this need not exist in crm_users.
const OUTSIDER_UUID = '00000000-0000-0000-0000-0000000000ff';
const TEST_PREFIX = '__inttest__';

// Track created IDs so we can clean up even if tests fail mid-way
const createdIds: string[] = [];

afterAll(async () => {
	// Hard-delete only the rows we created (identified by the test prefix on name)
	for (const id of createdIds) {
		await db.delete(crmLeads).where(eq(crmLeads.id, id));
	}
});

describe.skipIf(SKIP_DB)('createLead + getLead roundtrip (DB)', () => {
	it('creates a lead and reads it back by ID', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Roundtrip Org`, category: 'Sports' },
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		expect(lead.id).toBeTruthy();
		expect(lead.name).toBe(`${TEST_PREFIX} Roundtrip Org`);
		expect(lead.category).toBe('Sports');
		expect(lead.stage).toBe('new');
		expect(lead.source).toBe('manual');
		expect(lead.ownerId).toBe(MANAGER_UUID);
		expect(lead.handle).toMatch(/^@/);

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(lead.id);
		expect(fetched!.name).toBe(lead.name);
	});

	it('getLead returns null for a nonexistent UUID (404 path)', async () => {
		const result = await getLead('00000000-0000-0000-0000-ffffffffffff', MANAGER_UUID, 'manager');
		expect(result).toBeNull();
	});

	it('getLead returns null for a soft-deleted lead', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} SoftDeleted Org`, category: 'Other' },
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		// Soft-delete it directly
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched).toBeNull();
	});
});

describe.skipIf(SKIP_DB)('listLeads (DB)', () => {
	it('returns the created lead in the list', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} List Target`,
				category: 'Church',
				platform: 'Facebook',
				location: 'Davao',
				contactEmail: 'test@example.com'
			},
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		const list = await listLeads(MANAGER_UUID, 'manager');
		const found = list.find((l) => l.id === lead.id);
		expect(found).toBeDefined();
		expect(found!.name).toBe(`${TEST_PREFIX} List Target`);
		expect(found!.platform).toBe('Facebook');
		expect(found!.location).toBe('Davao');
		expect(found!.email).toBe('test@example.com');
	});

	it('excludes soft-deleted leads from the list', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Deleted From List`, category: 'Other' },
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));

		const list = await listLeads(MANAGER_UUID, 'manager');
		const found = list.find((l) => l.id === lead.id);
		expect(found).toBeUndefined();
	});

	it('returns an empty array when no non-deleted leads exist for a fresh state', async () => {
		// This test doesn't assert count==0 because the DB may have test rows from previous runs
		// or real data. It asserts the return type is an array.
		const list = await listLeads(MANAGER_UUID, 'manager');
		expect(Array.isArray(list)).toBe(true);
	});
});

describe.skipIf(SKIP_DB)('createLead field mapping (DB roundtrip)', () => {
	it('stores and maps all optional fields correctly', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Full Fields Org`,
				category: 'Concert',
				platform: 'Instagram',
				location: 'Manila',
				pageUrl: 'https://instagram.com/testorg',
				contactEmail: 'fields@example.com',
				eventName: 'Big Summer Gig',
				eventDateRaw: '12 Jul',
				notes: 'Integration test note'
			},
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched).not.toBeNull();
		expect(fetched!.platform).toBe('Instagram');
		expect(fetched!.location).toBe('Manila');
		expect(fetched!.pageUrl).toBe('https://instagram.com/testorg');
		expect(fetched!.email).toBe('fields@example.com');
		expect(fetched!.eventName).toBe('Big Summer Gig');
		expect(fetched!.notes).toBe('Integration test note');
	});

	it('derived handle uses input name when normalizedHandle not set', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Handle Test`, category: 'Other' },
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		// normalizedHandle is computed from name in createLead
		expect(lead.handle).toMatch(/^@/);
		expect(lead.handle.toLowerCase()).toContain('handletest');
	});
});

// ---------------------------------------------------------------------------
// Lead visibility / privacy scoping (GitHub #87) — DB integration.
// Proves AC#1, AC#3, AC#4, AC#8, AC#9, AC#10, AC#13 at the query layer.
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('lead visibility scoping (DB) — GitHub #87', () => {
	it('AC#1: createLead with selected visibility inserts grant rows', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis Selected`,
				category: 'Sports',
				visibility: 'selected',
				selectedUserIds: [REP_UUID]
			},
			MANAGER_UUID
		);
		createdIds.push(lead.id);

		expect(lead.visibility).toBe('selected');
		const grants = await getLeadVisibilityGrants(lead.id);
		expect(grants).toContain(REP_UUID);

		// The granted rep can see it; an outsider cannot.
		expect(await getLead(lead.id, REP_UUID, 'rep')).not.toBeNull();
		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).toBeNull();
	});

	it('AC#8: getLead returns null for a rep barred from an only_me lead (404 path, not redacted)', async () => {
		// Owned by REP_UUID, only_me → OUTSIDER cannot see it; owner + manager can.
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Vis OnlyMe`, category: 'Other', visibility: 'only_me' },
			REP_UUID
		);
		createdIds.push(lead.id);

		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).toBeNull();
		expect(await getLead(lead.id, REP_UUID, 'rep')).not.toBeNull();
	});

	it('AC#9/#10: a manager sees and can edit any only_me lead they do not own', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Vis MgrOverride`, category: 'Other', visibility: 'only_me' },
			REP_UUID
		);
		createdIds.push(lead.id);

		expect(await getLead(lead.id, MANAGER_UUID, 'manager')).not.toBeNull();
		const updated = await updateLead(
			lead.id,
			{ name: lead.name, category: 'Other', visibility: 'everyone' },
			MANAGER_UUID
		);
		expect(updated).not.toBeNull();
		expect(updated!.visibility).toBe('everyone');
	});

	it('AC#3/#4: updateLead visibility change takes effect + writes a history row', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Vis Change`, category: 'Other', visibility: 'everyone' },
			REP_UUID
		);
		createdIds.push(lead.id);

		// Visible to an outsider while everyone.
		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).not.toBeNull();

		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Other', visibility: 'only_me' },
			REP_UUID
		);

		// Now hidden from the outsider.
		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).toBeNull();

		const history = await db
			.select()
			.from(crmLeadHistory)
			.where(eq(crmLeadHistory.leadId, lead.id));
		const visRow = history.find((h) => h.field === 'visibility');
		expect(visRow).toBeDefined();
		expect(visRow!.oldValue).toBe('everyone');
		expect(visRow!.newValue).toBe('only_me');
	});

	it('updateLead to a non-selected scope clears lingering grants', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis GrantCleanup`,
				category: 'Other',
				visibility: 'selected',
				selectedUserIds: [MANAGER_UUID]
			},
			REP_UUID
		);
		createdIds.push(lead.id);
		expect(await getLeadVisibilityGrants(lead.id)).toContain(MANAGER_UUID);

		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Other', visibility: 'everyone' },
			REP_UUID
		);
		expect(await getLeadVisibilityGrants(lead.id)).toHaveLength(0);
	});

	it('AC#13: claimLead resets visibility to everyone and deletes grants', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis Claim`,
				category: 'Other',
				visibility: 'selected',
				selectedUserIds: [MANAGER_UUID]
			},
			REP_UUID
		);
		createdIds.push(lead.id);
		// Make it claimable (unowned).
		await db.update(crmLeads).set({ ownerId: null }).where(eq(crmLeads.id, lead.id));

		const claimed = await claimLead(lead.id, REP_UUID);
		expect(claimed).not.toBeNull();
		expect(claimed!.visibility).toBe('everyone');
		expect(await getLeadVisibilityGrants(lead.id)).toHaveLength(0);
	});

	it('AC#13: reassignLead resets visibility to everyone and deletes grants', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis Reassign`,
				category: 'Other',
				visibility: 'selected',
				selectedUserIds: [MANAGER_UUID]
			},
			REP_UUID
		);
		createdIds.push(lead.id);

		const reassigned = await reassignLead(lead.id, MANAGER_UUID, MANAGER_UUID);
		expect(reassigned).not.toBeNull();
		expect(reassigned!.visibility).toBe('everyone');
		expect(await getLeadVisibilityGrants(lead.id)).toHaveLength(0);
	});

	it('AC#13: unclaimLead resets visibility to everyone and deletes grants', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis Unclaim`,
				category: 'Other',
				visibility: 'selected',
				selectedUserIds: [MANAGER_UUID]
			},
			REP_UUID
		);
		createdIds.push(lead.id);

		const unclaimed = await unclaimLead(lead.id, REP_UUID);
		expect(unclaimed).not.toBeNull();
		expect(unclaimed!.visibility).toBe('everyone');
		expect(unclaimed!.ownerId).toBeNull();
		expect(await getLeadVisibilityGrants(lead.id)).toHaveLength(0);
	});
});
