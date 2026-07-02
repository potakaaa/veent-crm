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
import { createLead, getLead, listLeads, updateLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

// Skip when DATABASE_URL is not set (no postgres service available).
// Locally (docker compose up -d db + DATABASE_URL in .env), all tests run normally.
const SKIP_DB = !process.env.DATABASE_URL;

// Seeded manager UUID (from scripts/seed.ts — must be present for FK to pass)
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
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

		const fetched = await getLead(lead.id);
		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(lead.id);
		expect(fetched!.name).toBe(lead.name);
	});

	it('getLead returns null for a nonexistent UUID (404 path)', async () => {
		const result = await getLead('00000000-0000-0000-0000-ffffffffffff');
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

		const fetched = await getLead(lead.id);
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

		const list = await listLeads();
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

		const list = await listLeads();
		const found = list.find((l) => l.id === lead.id);
		expect(found).toBeUndefined();
	});

	it('returns an empty array when no non-deleted leads exist for a fresh state', async () => {
		// This test doesn't assert count==0 because the DB may have test rows from previous runs
		// or real data. It asserts the return type is an array.
		const list = await listLeads();
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

		const fetched = await getLead(lead.id);
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
// updateLead — hasFutureEvents flag (GitHub #94; AC1/AC2 persist, AC6, AC7, AC8)
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('updateLead — hasFutureEvents flag (DB) — #94', () => {
	async function mk(name: string) {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} ${name}`, category: 'Concert' },
			MANAGER_UUID
		);
		createdIds.push(lead.id);
		return lead;
	}

	it('AC1: persists hasFutureEvents=true; reopen returns it', async () => {
		const lead = await mk('FEPersist');
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: true },
			MANAGER_UUID
		);
		const fetched = await getLead(lead.id);
		expect(fetched!.hasFutureEvents).toBe(true);
	});

	it('AC2: toggle-off clears the flag; reload reflects false', async () => {
		const lead = await mk('FEToggleOff');
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: true },
			MANAGER_UUID
		);
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: false },
			MANAGER_UUID
		);
		const fetched = await getLead(lead.id);
		expect(fetched!.hasFutureEvents).toBe(false);
	});

	it('AC7: writes a crm_lead_history row with field has_future_events and correct old/new', async () => {
		const lead = await mk('FEAudit');
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: true },
			MANAGER_UUID
		);
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
		const before = await getLead(lead.id);
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: true },
			MANAGER_UUID
		);
		const after = await getLead(lead.id);
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
		await updateLead(
			lead.id,
			{ name: lead.name, category: 'Concert', hasFutureEvents: true },
			MANAGER_UUID
		);
		const fetched = await getLead(lead.id);
		expect(fetched!.stage).toBe('lost');
		expect(fetched!.hasFutureEvents).toBe(true);
	});
});
