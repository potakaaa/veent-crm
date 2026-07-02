/**
 * Unit tests for listLeadsFiltered and getLeadCountries behaviour
 * (DB integration — skipped when DATABASE_URL is absent).
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	listLeadsFiltered,
	getLeadCountries,
	getUnassignedLeadCountries,
	listUnassignedLeads,
	createLead
} from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const REP_UUID = '00000000-0000-0000-0000-000000000002';
// A rep with no ownership/grant — used to assert exclusion of restricted leads.
const OUTSIDER_UUID = '00000000-0000-0000-0000-0000000000ff';
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
			role: 'manager',
			segment: 'all',
			country: '__TEST_MANILA__'
		});

		// All returned leads filtered by __TEST_MANILA__ must not include the __TEST_CEBU__ lead.
		const hasNoMatch = leads.every((l) => !l.name.includes('CountryNoMatch'));
		expect(hasNoMatch).toBe(true);
	});

	it('country filter "All countries" returns all non-deleted', async () => {
		const { leads: all } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'all'
		});
		const { leads: filtered } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
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
			role: 'manager',
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
			role: 'manager',
			segment: 'mine',
			pageSize: 1,
			page: 1
		});
		if (total < 2) return; // Not enough leads to test — skip

		const { leads: p2 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'mine',
			pageSize: 1,
			page: 2
		});

		expect(p1[0]?.id).not.toBe(p2[0]?.id);
	});

	it('page beyond total returns empty array', async () => {
		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'mine',
			page: 99999
		});
		expect(leads).toHaveLength(0);
	});

	it('total count is consistent between page 1 and page 2 requests', async () => {
		const { total: t1 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'mine',
			pageSize: 1,
			page: 1
		});
		const { total: t2 } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
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

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('lost leads excluded from all segment (product rule)', async () => {
		const lead = await mkLead('LostHidden', { stage: 'contacted' });
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('lost segment shows only lost leads', async () => {
		const lead = await mkLead('LostVisible', { stage: 'contacted' });
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
			segment: 'lost'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
		expect(leads.every((l) => l.stage === 'lost')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Up for Grabs (unassigned) country + category filters — GitHub #91
// Hybrid gates (real DB): AC#2, AC#3, AC#4, AC#9 (DB half), AC#11.
// ---------------------------------------------------------------------------

const UFG_PREFIX = '__ufgtest__';

/**
 * Create a lead that lands in the Up for Grabs queue (ownerId=null, active stage),
 * with an explicit country + category. createLead assigns an owner, so we null it out.
 */
async function mkUnassigned(name: string, country: string, category: string) {
	const lead = await createLead(
		{
			name: `${UFG_PREFIX} ${name}`,
			category: category as Parameters<typeof createLead>[0]['category']
		},
		MANAGER_UUID
	);
	created.push(lead.id);
	await db
		.update(crmLeads)
		.set({ ownerId: null, country, stage: 'new' })
		.where(eq(crmLeads.id, lead.id));
	return lead;
}

const isTestLead = (l: { name: string }) => l.name.startsWith(UFG_PREFIX);

describe.skipIf(SKIP_DB)('getUnassignedLeadCountries (DB) — #91 AC#11', () => {
	it('returns countries only from unowned/active/non-deleted leads', async () => {
		await mkUnassigned('CountryUS', '__UFG_US__', 'Sports');
		await mkUnassigned('CountryPH', '__UFG_PH__', 'Concert');

		// An OWNED lead with a distinct country must NOT surface in the unassigned country list.
		const owned = await mkUnassigned('Owned', '__UFG_OWNED_ONLY__', 'Sports');
		await db.update(crmLeads).set({ ownerId: MANAGER_UUID }).where(eq(crmLeads.id, owned.id));

		const countries = await getUnassignedLeadCountries();
		expect(countries).toContain('__UFG_US__');
		expect(countries).toContain('__UFG_PH__');
		expect(countries).not.toContain('__UFG_OWNED_ONLY__');
	});

	it('excludes won/lost and soft-deleted leads (scope parity with listUnassignedLeads)', async () => {
		const lost = await mkUnassigned('LostCountry', '__UFG_LOST_ONLY__', 'Sports');
		await db
			.update(crmLeads)
			.set({ stage: 'lost', lostReason: 'no_response' })
			.where(eq(crmLeads.id, lost.id));

		const del = await mkUnassigned('DeletedCountry', '__UFG_DELETED_ONLY__', 'Sports');
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, del.id));

		const countries = await getUnassignedLeadCountries();
		expect(countries).not.toContain('__UFG_LOST_ONLY__');
		expect(countries).not.toContain('__UFG_DELETED_ONLY__');
	});
});

describe.skipIf(SKIP_DB)('listUnassignedLeads — country/category filters (DB) — #91', () => {
	it('AC#2: multi-country selection returns the union across countries', async () => {
		await mkUnassigned('MC-US', '__UFG_MC_US__', 'Sports');
		await mkUnassigned('MC-PH', '__UFG_MC_PH__', 'Sports');
		await mkUnassigned('MC-JP', '__UFG_MC_JP__', 'Sports');

		const { leads } = await listUnassignedLeads(1, 200, undefined, undefined, {
			country: ['__UFG_MC_US__', '__UFG_MC_PH__']
		});
		const names = leads.filter(isTestLead).map((l) => l.name);
		expect(names.some((n) => n.includes('MC-US'))).toBe(true);
		expect(names.some((n) => n.includes('MC-PH'))).toBe(true);
		expect(names.some((n) => n.includes('MC-JP'))).toBe(false);
	});

	it('AC#3: multi-category selection returns the union across categories', async () => {
		await mkUnassigned('Cat-Sports', '__UFG_CAT_C1__', 'Sports');
		await mkUnassigned('Cat-Concert', '__UFG_CAT_C1__', 'Concert');
		await mkUnassigned('Cat-Expo', '__UFG_CAT_C1__', 'Expo');

		const { leads } = await listUnassignedLeads(1, 200, undefined, undefined, {
			category: ['Sports', 'Concert']
		});
		const test = leads.filter(isTestLead);
		expect(test.some((l) => l.name.includes('Cat-Sports'))).toBe(true);
		expect(test.some((l) => l.name.includes('Cat-Concert'))).toBe(true);
		expect(test.some((l) => l.name.includes('Cat-Expo'))).toBe(false);
	});

	it('AC#4: country + category combine as AND across filter types', async () => {
		await mkUnassigned('AND-Match', '__UFG_AND__', 'Theater');
		await mkUnassigned('AND-CountryOnly', '__UFG_AND__', 'Workshop');
		await mkUnassigned('AND-CategoryOnly', '__UFG_AND_OTHER__', 'Theater');

		const { leads } = await listUnassignedLeads(1, 200, undefined, undefined, {
			country: ['__UFG_AND__'],
			category: ['Theater']
		});
		const test = leads.filter(isTestLead);
		expect(test.some((l) => l.name.includes('AND-Match'))).toBe(true);
		expect(test.some((l) => l.name.includes('AND-CountryOnly'))).toBe(false);
		expect(test.some((l) => l.name.includes('AND-CategoryOnly'))).toBe(false);
	});

	it('AC#9 (DB half): a zero-match combination returns an empty array', async () => {
		await mkUnassigned('ZeroMatch', '__UFG_ZERO__', 'Sports');
		const { leads } = await listUnassignedLeads(1, 200, undefined, undefined, {
			country: ['__UFG_NONEXISTENT_COUNTRY__'],
			category: ['Camp']
		});
		expect(leads.filter(isTestLead)).toHaveLength(0);
	});

	it('empty filter arrays behave identically to no filters (backward compatible)', async () => {
		const { total: baseline } = await listUnassignedLeads(1, 25, undefined, undefined, {
			country: [],
			category: []
		});
		const { total: nofilter } = await listUnassignedLeads();
		expect(baseline).toBe(nofilter);
	});
});

describe.skipIf(SKIP_DB)('listLeadsFiltered — staleOnly (DB)', () => {
	it('staleOnly returns leads idle >30 days', async () => {
		const staleDate = new Date(Date.now() - 31 * 86_400_000);
		const lead = await mkLead('StaleFilter', { lastActivityAt: staleDate });

		const { leads } = await listLeadsFiltered({
			userId: MANAGER_UUID,
			role: 'manager',
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
			role: 'manager',
			segment: 'mine',
			staleOnly: true
		});
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Lead visibility scoping (GitHub #87) — list enforcement.
// Proves AC#5 (rep excluded), AC#9 (manager sees all), AC#11 (unassigned visible).
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('listLeadsFiltered — visibility scoping (DB) — #87', () => {
	it('AC#5: a non-permitted rep does NOT see an only_me lead owned by someone else', async () => {
		const lead = await createLead(
			{ name: `${PREFIX} VisOnlyMe`, category: 'Sports', visibility: 'only_me' },
			MANAGER_UUID
		);
		created.push(lead.id);

		const { leads } = await listLeadsFiltered({
			userId: OUTSIDER_UUID,
			role: 'rep',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeUndefined();
	});

	it('AC#9: a manager sees an only_me lead regardless of visibility', async () => {
		const lead = await createLead(
			{ name: `${PREFIX} VisMgrSeesAll`, category: 'Sports', visibility: 'only_me' },
			MANAGER_UUID
		);
		created.push(lead.id);

		const { leads } = await listLeadsFiltered({
			userId: OUTSIDER_UUID,
			role: 'manager',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
	});

	it('AC#11: an unassigned lead stays visible to any rep even if it was once only_me', async () => {
		const lead = await createLead(
			{ name: `${PREFIX} VisUnassigned`, category: 'Sports', visibility: 'only_me' },
			MANAGER_UUID
		);
		created.push(lead.id);
		// Unown it (up-for-grabs) — unowned leads are visibility-exempt.
		await db.update(crmLeads).set({ ownerId: null, stage: 'new' }).where(eq(crmLeads.id, lead.id));

		const { leads } = await listLeadsFiltered({
			userId: OUTSIDER_UUID,
			role: 'rep',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
	});

	it('a rep DOES see an everyone-visibility lead owned by someone else', async () => {
		const lead = await createLead(
			{ name: `${PREFIX} VisEveryone`, category: 'Sports', visibility: 'everyone' },
			REP_UUID
		);
		created.push(lead.id);

		const { leads } = await listLeadsFiltered({
			userId: OUTSIDER_UUID,
			role: 'rep',
			segment: 'all'
		});
		expect(leads.find((l) => l.id === lead.id)).toBeDefined();
	});
});
