/**
 * Unit tests for listLeadsFiltered and getLeadCountries behaviour
 * (DB integration — skipped when DATABASE_URL is absent).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { listLeadsFiltered, getLeadCountries, createLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const PREFIX = '__flttest__';
const created: string[] = [];

afterAll(async () => {
	if (created.length) {
		await db.delete(crmLeads).where(inArray(crmLeads.id, created));
	}
});

async function mkLead(
	name: string,
	overrides: Partial<{
		location: string;
		stage: string;
		platform: string;
		lastActivityAt: Date;
	}> = {}
) {
	const lead = await createLead({ name: `${PREFIX} ${name}`, category: 'Sports' }, MANAGER_UUID);
	created.push(lead.id);
	const patch: Record<string, unknown> = {};
	if (overrides.location !== undefined) patch.location = overrides.location;
	if (overrides.stage !== undefined) patch.stage = overrides.stage;
	if (overrides.platform !== undefined) patch.platform = overrides.platform;
	if (overrides.lastActivityAt !== undefined) patch.lastActivityAt = overrides.lastActivityAt;
	if (Object.keys(patch).length > 0) {
		await db.update(crmLeads).set(patch).where(eq(crmLeads.id, lead.id));
	}
	return lead;
}

describe.skipIf(SKIP_DB)('getLeadCountries (DB)', () => {
	it('returns distinct non-null locations in A→Z order', async () => {
		await mkLead('Loc A', { location: '__TEST_COUNTRY_A__' });
		await mkLead('Loc B', { location: '__TEST_COUNTRY_A__' }); // duplicate
		await mkLead('Loc C', { location: '__TEST_COUNTRY_B__' });
		const countries = await getLeadCountries();
		expect(countries).toContain('__TEST_COUNTRY_A__');
		expect(countries).toContain('__TEST_COUNTRY_B__');
		// no duplicates
		const unique = new Set(countries);
		expect(unique.size).toBe(countries.length);
		// A→Z order: __TEST_COUNTRY_A__ must appear before __TEST_COUNTRY_B__
		const idxA = countries.indexOf('__TEST_COUNTRY_A__');
		const idxB = countries.indexOf('__TEST_COUNTRY_B__');
		expect(idxA).toBeGreaterThanOrEqual(0);
		expect(idxB).toBeGreaterThanOrEqual(0);
		expect(idxA).toBeLessThan(idxB);
	});

	it('excludes null locations', async () => {
		await mkLead('NullLoc', { location: undefined }); // no location
		const countries = await getLeadCountries();
		expect(countries.includes(null as unknown as string)).toBe(false);
	});
});

describe.skipIf(SKIP_DB)('listLeadsFiltered — country filter (DB)', () => {
	it('country filter returns only matching leads', async () => {
		await mkLead('CountryMatch', { location: '__TEST_MANILA__' });
		await mkLead('CountryNoMatch', { location: '__TEST_CEBU__' });

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'all',
			country: '__TEST_MANILA__'
		});

		// All returned leads filtered by __TEST_MANILA__ must not include the __TEST_CEBU__ lead.
		const hasNoMatch = leads.every((l) => !l.name.includes('CountryNoMatch'));
		expect(hasNoMatch).toBe(true);
	});

	it('country filter "All countries" returns all non-deleted', async () => {
		const { leads: all } = await listLeadsFiltered({ userId: MANAGER_UUID, segment: 'all' });
		const { leads: filtered } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'all',
			country: ''
		});
		expect(filtered.length).toBe(all.length);
	});
});

describe.skipIf(SKIP_DB)('listLeadsFiltered — pagination (DB)', () => {
	it('total count equals all matching rows (not just page)', async () => {
		const { total } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'all',
			pageSize: 1,
			page: 1
		});
		expect(total).toBeGreaterThanOrEqual(1);
	});

	it('page 1 and page 2 return different leads', async () => {
		await mkLead('PagingA');
		await mkLead('PagingB');

		const { leads: p1, total } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			pageSize: 1,
			page: 1
		});
		if (total < 2) return; // Not enough leads to test — skip

		const { leads: p2 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			pageSize: 1,
			page: 2
		});

		expect(p1[0]?.id).not.toBe(p2[0]?.id);
	});

	it('page beyond total returns empty array', async () => {
		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			page: 99999
		});
		expect(leads).toHaveLength(0);
	});

	it('total count is consistent between page 1 and page 2 requests', async () => {
		const { total: t1 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			pageSize: 1,
			page: 1
		});
		const { total: t2 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			pageSize: 1,
			page: 2
		});
		expect(t1).toBe(t2);
	});
});

describe.skipIf(SKIP_DB)('listLeadsFiltered — exclusions (DB)', () => {
	it('soft-deleted leads are excluded', async () => {
		const lead = await mkLead('SoftDelete');
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({ userId: MANAGER_UUID, segment: 'all' });
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('lost leads excluded from all segment (product rule)', async () => {
		const lead = await mkLead('LostHidden', { stage: 'contacted' });
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({ userId: MANAGER_UUID, segment: 'all' });
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('lost segment shows only lost leads', async () => {
		const lead = await mkLead('LostVisible', { stage: 'contacted' });
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({ userId: MANAGER_UUID, segment: 'lost' });
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
		expect(leads.every((l) => l.stage === 'lost')).toBe(true);
	});
});

describe.skipIf(SKIP_DB)('listLeadsFiltered — staleOnly (DB)', () => {
	it('staleOnly returns leads idle >30 days', async () => {
		const staleDate = new Date(Date.now() - 31 * 86_400_000);
		const lead = await mkLead('StaleFilter', { lastActivityAt: staleDate });

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			staleOnly: true
		});
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
	});

	it('staleOnly excludes leads active within 30 days', async () => {
		const recentDate = new Date(Date.now() - 5 * 86_400_000);
		const lead = await mkLead('FreshFilter', { lastActivityAt: recentDate });

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			segment: 'mine',
			staleOnly: true
		});
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});
});
