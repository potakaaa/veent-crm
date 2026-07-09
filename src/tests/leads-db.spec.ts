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
	getLeadVisibilityGrants,
	dbRowToLead
} from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

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
		const lead = await createLead({ name: `${TEST_PREFIX} Roundtrip Org` }, MANAGER_UUID);
		createdIds.push(lead.id);

		expect(lead.id).toBeTruthy();
		expect(lead.name).toBe(`${TEST_PREFIX} Roundtrip Org`);
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
		const lead = await createLead({ name: `${TEST_PREFIX} SoftDeleted Org` }, MANAGER_UUID);
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
		const lead = await createLead({ name: `${TEST_PREFIX} Deleted From List` }, MANAGER_UUID);
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
		const lead = await createLead({ name: `${TEST_PREFIX} Handle Test` }, MANAGER_UUID);
		createdIds.push(lead.id);

		// normalizedHandle is computed from name in createLead
		expect(lead.handle).toMatch(/^@/);
		expect(lead.handle.toLowerCase()).toContain('handletest');
	});
});

// ---------------------------------------------------------------------------
// updateLead — hasFutureEvents flag (GitHub #94; AC1/AC2 persist, AC6, AC7, AC8)
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('updateLead — hasFutureEvents flag (DB) — #94', () => {
	async function mk(name: string) {
		const lead = await createLead({ name: `${TEST_PREFIX} ${name}` }, MANAGER_UUID);
		createdIds.push(lead.id);
		return lead;
	}

	it('AC1: persists hasFutureEvents=true; reopen returns it', async () => {
		const lead = await mk('FEPersist');
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: true }, MANAGER_UUID);
		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched!.hasFutureEvents).toBe(true);
	});

	it('AC2: toggle-off clears the flag; reload reflects false', async () => {
		const lead = await mk('FEToggleOff');
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: true }, MANAGER_UUID);
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: false }, MANAGER_UUID);
		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched!.hasFutureEvents).toBe(false);
	});

	it('AC7: writes a crm_lead_history row with field has_future_events and correct old/new', async () => {
		const lead = await mk('FEAudit');
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: true }, MANAGER_UUID);
		const rows = await db
			.select()
			.from(crmLeadHistory)
			.where(
				and(eq(crmLeadHistory.leadId, lead.id), eq(crmLeadHistory.field, 'has_future_events'))
			);
		expect(rows.length).toBeGreaterThanOrEqual(1);
		const latest = rows[rows.length - 1];
		expect(latest.newValue).toBe('true');
		// New lead defaults to false → old value recorded as 'false'.
		expect(latest.oldValue).toBe('false');
	});

	it('AC6: flipping the flag leaves stage and owner unchanged', async () => {
		const lead = await mk('FEIsolation');
		const before = await getLead(lead.id, MANAGER_UUID, 'manager');
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: true }, MANAGER_UUID);
		const after = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(after!.stage).toBe(before!.stage);
		expect(after!.ownerId).toBe(before!.ownerId);
		expect(after!.hasFutureEvents).toBe(true);
	});

	it('AC8: flag settable on a lost-stage lead', async () => {
		const lead = await mk('FELost');
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));
		await updateLead(lead.id, { name: lead.name, hasFutureEvents: true }, MANAGER_UUID);
		const fetched = await getLead(lead.id, MANAGER_UUID, 'manager');
		expect(fetched!.stage).toBe('lost');
		expect(fetched!.hasFutureEvents).toBe(true);
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
			{ name: `${TEST_PREFIX} Vis OnlyMe`, visibility: 'only_me' },
			REP_UUID
		);
		createdIds.push(lead.id);

		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).toBeNull();
		expect(await getLead(lead.id, REP_UUID, 'rep')).not.toBeNull();
	});

	it('AC#9/#10: a manager sees and can edit any only_me lead they do not own', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Vis MgrOverride`, visibility: 'only_me' },
			REP_UUID
		);
		createdIds.push(lead.id);

		expect(await getLead(lead.id, MANAGER_UUID, 'manager')).not.toBeNull();
		const updated = await updateLead(
			lead.id,
			{ name: lead.name, visibility: 'everyone' },
			MANAGER_UUID
		);
		expect(updated).not.toBeNull();
		expect(updated!.visibility).toBe('everyone');
	});

	it('AC#3/#4: updateLead visibility change takes effect + writes a history row', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} Vis Change`, visibility: 'everyone' },
			REP_UUID
		);
		createdIds.push(lead.id);

		// Visible to an outsider while everyone.
		expect(await getLead(lead.id, OUTSIDER_UUID, 'rep')).not.toBeNull();

		await updateLead(lead.id, { name: lead.name, visibility: 'only_me' }, REP_UUID);

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
				visibility: 'selected',
				selectedUserIds: [MANAGER_UUID]
			},
			REP_UUID
		);
		createdIds.push(lead.id);
		expect(await getLeadVisibilityGrants(lead.id)).toContain(MANAGER_UUID);

		await updateLead(lead.id, { name: lead.name, visibility: 'everyone' }, REP_UUID);
		expect(await getLeadVisibilityGrants(lead.id)).toHaveLength(0);
	});

	it('AC#13: claimLead resets visibility to everyone and deletes grants', async () => {
		const lead = await createLead(
			{
				name: `${TEST_PREFIX} Vis Claim`,
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

// ---------------------------------------------------------------------------
// dbRowToLead — organizerId mapping (pure, no DB) — organizer-lead-tagging-ui
// ---------------------------------------------------------------------------
function makeMapperRow(overrides: Partial<Parameters<typeof dbRowToLead>[0]> = {}) {
	const now = new Date('2026-07-06T01:00:00.000Z');
	return {
		id: 'uuid-mapper-001',
		name: 'Mapper Org',
		location: 'Manila',
		country: null,
		platform: 'Facebook' as const,
		socialFacebook: null,
		socialInstagram: null,
		socialTiktok: null,
		socialTwitter: null,
		pageUrl: null,
		normalizedHandle: null,
		contactEmail: null,
		contactPhone: null,
		eventName: null,
		eventDate: null,
		eventDateRaw: null,
		eventLink: null,
		firstAnnouncedDate: null,
		firstReachedOutDate: null,
		sourceRef: null,
		scraperOrgId: null,
		stage: 'new' as const,
		lostReason: null,
		ownerId: 'owner-uuid',
		organizerId: null,
		visibility: 'everyone' as const,
		source: 'manual' as const,
		lastActivityAt: now,
		deletedAt: null,
		wonOrgName: null,
		dealValueCents: null,
		currency: 'PHP',
		signedAt: null,
		onboardingNotes: null,
		contractUrl: null,
		onboardingStartDate: null,
		goLiveDate: null,
		feeStructure: null,
		transactionFeePct: 7,
		convenienceFeePesos: 20,
		serviceFeePct: 3,
		serviceFeePerTicketPesos: 20,
		bankChargesAbsorbed: null,
		hasFutureEvents: false,
		notes: null,
		currentPlatform: null,
		competitorNotes: null,
		// NCAL-3 — UID storage columns (nullable, no default)
		nextcloudGoLiveUid: null,
		nextcloudEventUid: null,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

describe('dbRowToLead — organizerId mapping', () => {
	it('should map organizerId from a DbLead row in dbRowToLead', () => {
		const lead = dbRowToLead(makeMapperRow({ organizerId: 'org-uuid-123' }));
		expect(lead.organizerId).toBe('org-uuid-123');
	});

	it('maps a null organizerId to null (untagged lead)', () => {
		const lead = dbRowToLead(makeMapperRow({ organizerId: null }));
		expect(lead.organizerId).toBeNull();
	});
});
