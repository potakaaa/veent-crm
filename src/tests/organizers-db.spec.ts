/**
 * DB integration tests for Organizers (GitHub #189, #190) — requires the docker postgres
 * container to be running.
 * Run: docker compose up -d db && bun run test:unit:ci
 *
 * Skipped automatically when DATABASE_URL is not set (CI has no postgres service), matching
 * every other *-db.spec.ts in this repo. Tests the actual Drizzle query layer directly
 * (no HTTP, auth bypassed).
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	listOrganizersWithLeadCount,
	getOrganizer,
	listLinkedLeadsForOrganizer,
	listOrganizersFiltered,
	getOrganizerCountries
} from '$lib/server/db/organizers';
import { createLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmOrganizers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;

// Seeded rep/manager UUIDs (from scripts/seed.ts — required so lead ownerId FK passes).
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const REP_UUID = '00000000-0000-0000-0000-000000000002';
const TEST_PREFIX = '__orgtest__';

const createdLeadIds: string[] = [];
const createdOrgIds: string[] = [];

async function makeOrganizer(name: string, handle: string | null = null): Promise<string> {
	const [row] = await db
		.insert(crmOrganizers)
		.values({ name: `${TEST_PREFIX} ${name}`, normalizedHandle: handle })
		.returning();
	createdOrgIds.push(row.id);
	return row.id;
}

type InsertStage = NonNullable<(typeof crmLeads.$inferInsert)['stage']>;

async function makeLead(
	organizerId: string,
	stage: InsertStage,
	ownerId: string | null = MANAGER_UUID
): Promise<string> {
	const [row] = await db
		.insert(crmLeads)
		.values({
			name: `${TEST_PREFIX} lead ${stage}`,
			category: 'Other',
			organizerId,
			ownerId,
			visibility: 'everyone',
			stage,
			source: 'manual'
		})
		.returning();
	createdLeadIds.push(row.id);
	return row.id;
}

afterAll(async () => {
	for (const id of createdLeadIds) await db.delete(crmLeads).where(eq(crmLeads.id, id));
	for (const id of createdOrgIds) await db.delete(crmOrganizers).where(eq(crmOrganizers.id, id));
});

describe.skipIf(SKIP_DB)('listOrganizersWithLeadCount (DB)', () => {
	it('returns correct lead count per organizer, and 0 for a zero-lead organizer (AC2, AC9)', async () => {
		const withLeads = await makeOrganizer('WithLeads');
		const empty = await makeOrganizer('Empty');
		await makeLead(withLeads, 'new');
		await makeLead(withLeads, 'won');

		const rows = await listOrganizersWithLeadCount();
		const withLeadsRow = rows.find((r) => r.id === withLeads);
		const emptyRow = rows.find((r) => r.id === empty);

		expect(withLeadsRow?.leadCount).toBe(2);
		expect(emptyRow?.leadCount).toBe(0);
	});

	it('does not count soft-deleted leads (AC2)', async () => {
		const org = await makeOrganizer('SoftDelete');
		await makeLead(org, 'new');
		const deletedId = await makeLead(org, 'new');
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, deletedId));

		const rows = await listOrganizersWithLeadCount();
		expect(rows.find((r) => r.id === org)?.leadCount).toBe(1);
	});
});

describe.skipIf(SKIP_DB)('getOrganizer (DB)', () => {
	it('returns the organizer row by id', async () => {
		const org = await makeOrganizer('Lookup');
		const row = await getOrganizer(org);
		expect(row?.id).toBe(org);
	});

	it('returns null for a nonexistent id', async () => {
		const row = await getOrganizer('11111111-1111-1111-1111-111111111111');
		expect(row).toBeNull();
	});
});

describe.skipIf(SKIP_DB)('listLinkedLeadsForOrganizer (DB)', () => {
	it('includes leads in EVERY stage — no implicit stage filter (AC4)', async () => {
		const org = await makeOrganizer('AllStages');
		await makeLead(org, 'new');
		await makeLead(org, 'won');
		await makeLead(org, 'lost');

		const leads = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager');
		const stages = leads.map((l) => l.stage).sort();
		expect(stages).toEqual(['lost', 'new', 'won']);
	});

	it('sources event-history fields from crm_leads and enriches owner name (AC5)', async () => {
		const org = await makeOrganizer('Fields');
		await makeLead(org, 'new', MANAGER_UUID);

		const [lead] = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager');
		expect(lead.stage).toBe('new');
		expect(lead.ownerName).toBeTruthy();
	});

	it("applies visibilityCondition — a rep does not see another rep's only_me lead (AC6)", async () => {
		const org = await makeOrganizer('Visibility');
		// Owned by MANAGER_UUID, restricted to only_me → REP must not see it.
		const restrictedId = await makeLead(org, 'new', MANAGER_UUID);
		await db.update(crmLeads).set({ visibility: 'only_me' }).where(eq(crmLeads.id, restrictedId));

		const repView = await listLinkedLeadsForOrganizer(org, REP_UUID, 'rep');
		expect(repView.some((l) => l.id === restrictedId)).toBe(false);

		// Manager bypasses visibility (no-op TRUE) → sees it.
		const managerView = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager');
		expect(managerView.some((l) => l.id === restrictedId)).toBe(true);
	});

	it('returns an empty array (no throw) for a zero-lead organizer (AC9)', async () => {
		const org = await makeOrganizer('EmptyDetail');
		const leads = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager');
		expect(leads).toEqual([]);
	});
});

describe.skipIf(SKIP_DB)('createLead organizerId persistence (DB)', () => {
	it('persists organizerId when provided (AC8)', async () => {
		const org = await makeOrganizer('CreateWith');
		const lead = await createLead(
			{ name: `${TEST_PREFIX} created`, category: 'Other', organizerId: org },
			MANAGER_UUID
		);
		createdLeadIds.push(lead.id);

		const [row] = await db.select().from(crmLeads).where(eq(crmLeads.id, lead.id));
		expect(row.organizerId).toBe(org);
	});

	it('persists null organizerId when omitted (AC8)', async () => {
		const lead = await createLead(
			{ name: `${TEST_PREFIX} created-null`, category: 'Other' },
			MANAGER_UUID
		);
		createdLeadIds.push(lead.id);

		const [row] = await db.select().from(crmLeads).where(eq(crmLeads.id, lead.id));
		expect(row.organizerId).toBeNull();
	});
});

// ── organizer-list-pagination-filters (#: list + detail query logic) ────────────────
// Rich fixture helpers for the filtered/sorted/paginated query paths added by this plan.

async function makeOrganizerFull(
	name: string,
	opts: { handle?: string | null; location?: string | null } = {}
): Promise<string> {
	const [row] = await db
		.insert(crmOrganizers)
		.values({
			name: `${TEST_PREFIX} ${name}`,
			normalizedHandle: opts.handle ?? null,
			location: opts.location ?? null
		})
		.returning();
	createdOrgIds.push(row.id);
	return row.id;
}

async function makeLeadFull(
	organizerId: string,
	opts: {
		stage?: InsertStage;
		ownerId?: string | null;
		country?: string | null;
		eventName?: string | null;
		eventDate?: string | null;
		visibility?: NonNullable<(typeof crmLeads.$inferInsert)['visibility']>;
	} = {}
): Promise<string> {
	const [row] = await db
		.insert(crmLeads)
		.values({
			name: `${TEST_PREFIX} lead`,
			category: 'Other',
			organizerId,
			ownerId: opts.ownerId === undefined ? MANAGER_UUID : opts.ownerId,
			visibility: opts.visibility ?? 'everyone',
			stage: opts.stage ?? 'new',
			source: 'manual',
			country: opts.country ?? null,
			eventName: opts.eventName ?? null,
			eventDate: opts.eventDate ?? null
		})
		.returning();
	createdLeadIds.push(row.id);
	return row.id;
}

describe.skipIf(SKIP_DB)('listOrganizersFiltered (DB)', () => {
	it('paginates: 10/page with correct total across page boundaries (AC1)', async () => {
		// 12 organizers sharing a unique search token so pagination is isolated from other rows.
		const token = `pageA${Date.now()}`;
		for (let i = 0; i < 12; i++) {
			await makeOrganizerFull(`${token} ${String(i).padStart(2, '0')}`);
		}
		const p1 = await listOrganizersFiltered({ search: token, page: 1, pageSize: 10 });
		expect(p1.total).toBe(12);
		expect(p1.organizers.length).toBe(10);

		const p2 = await listOrganizersFiltered({ search: token, page: 2, pageSize: 10 });
		expect(p2.total).toBe(12);
		expect(p2.organizers.length).toBe(2);
	});

	it('sorts by name asc → desc → asc cycle (AC2)', async () => {
		const token = `sortB${Date.now()}`;
		await makeOrganizerFull(`${token} Charlie`);
		await makeOrganizerFull(`${token} Alpha`);
		await makeOrganizerFull(`${token} Bravo`);

		const asc = await listOrganizersFiltered({ search: token, sort: 'name', dir: 'asc' });
		const ascNames = asc.organizers.map((o) => o.name);
		expect(ascNames).toEqual([...ascNames].sort());

		const desc = await listOrganizersFiltered({ search: token, sort: 'name', dir: 'desc' });
		const descNames = desc.organizers.map((o) => o.name);
		expect(descNames).toEqual([...ascNames].reverse());
	});

	it('sorts by leads-count aggregate both directions (AC3)', async () => {
		const token = `leadsC${Date.now()}`;
		const few = await makeOrganizerFull(`${token} Few`);
		const many = await makeOrganizerFull(`${token} Many`);
		await makeLeadFull(few, { stage: 'new' });
		await makeLeadFull(many, { stage: 'new' });
		await makeLeadFull(many, { stage: 'won' });
		await makeLeadFull(many, { stage: 'lost' });

		const desc = await listOrganizersFiltered({ search: token, sort: 'leads', dir: 'desc' });
		expect(desc.organizers[0].id).toBe(many);
		const asc = await listOrganizersFiltered({ search: token, sort: 'leads', dir: 'asc' });
		expect(asc.organizers[0].id).toBe(few);
	});

	it('search matches name and handle via case-insensitive ilike (AC4)', async () => {
		const stamp = Date.now();
		const byName = await makeOrganizerFull(`ZebraName${stamp}`);
		const byHandle = await makeOrganizerFull(`Unrelated${stamp}`, {
			handle: `zebrahandle${stamp}`
		});

		const nameHit = await listOrganizersFiltered({ search: `zebraname${stamp}` });
		expect(nameHit.organizers.some((o) => o.id === byName)).toBe(true);

		const handleHit = await listOrganizersFiltered({ search: `ZEBRAHANDLE${stamp}` });
		expect(handleHit.organizers.some((o) => o.id === byHandle)).toBe(true);
	});

	it('country filter narrows via normalized location; default shows all (AC5)', async () => {
		const token = `ctryE${Date.now()}`;
		const ph = await makeOrganizerFull(`${token} PH`, { location: 'Makati, Philippines' });
		const sg = await makeOrganizerFull(`${token} SG`, { location: 'Singapore' });

		const all = await listOrganizersFiltered({ search: token });
		expect(all.total).toBe(2);

		const phOnly = await listOrganizersFiltered({ search: token, country: 'Philippines' });
		expect(phOnly.organizers.map((o) => o.id)).toEqual([ph]);

		const sgOnly = await listOrganizersFiltered({ search: token, country: 'Singapore' });
		expect(sgOnly.organizers.map((o) => o.id)).toEqual([sg]);
	});

	it('total reflects post-country-filter count, resetting pagination correctly (AC6)', async () => {
		const token = `resetF${Date.now()}`;
		for (let i = 0; i < 12; i++) {
			await makeOrganizerFull(`${token} ${i}`, {
				location: i < 3 ? 'Cebu, Philippines' : 'Singapore'
			});
		}
		// Country filter shrinks the set below one page → total is the filtered count, not 12.
		const phP1 = await listOrganizersFiltered({
			search: token,
			country: 'Philippines',
			page: 1,
			pageSize: 10
		});
		expect(phP1.total).toBe(3);
		expect(phP1.organizers.length).toBe(3);
	});

	it('lead count per organizer is unaffected by list-level filters (AC7)', async () => {
		const token = `countG${Date.now()}`;
		const org = await makeOrganizerFull(`${token} Counted`, { location: 'Manila, Philippines' });
		await makeLeadFull(org, { stage: 'new' });
		await makeLeadFull(org, { stage: 'won' });
		const deleted = await makeLeadFull(org, { stage: 'new' });
		await db.update(crmLeads).set({ deletedAt: new Date() }).where(eq(crmLeads.id, deleted));

		const filtered = await listOrganizersFiltered({ search: token, country: 'Philippines' });
		const row = filtered.organizers.find((o) => o.id === org);
		expect(row?.leadCount).toBe(2); // non-deleted only, unchanged by the country filter
	});
});

describe.skipIf(SKIP_DB)('getOrganizerCountries (DB)', () => {
	it('returns distinct normalized organizer countries', async () => {
		await makeOrganizerFull(`CtryList${Date.now()}`, { location: 'Davao, Philippines' });
		const countries = await getOrganizerCountries();
		expect(countries).toContain('Philippines');
		// Distinct + sorted.
		expect(countries).toEqual([...new Set(countries)].sort());
	});
});

describe.skipIf(SKIP_DB)('listLinkedLeadsForOrganizer — filtered/paginated (opts)', () => {
	it('sorts event/eventDate asc → desc cycle (AC8)', async () => {
		const org = await makeOrganizerFull(`DetailSort${Date.now()}`);
		await makeLeadFull(org, { eventName: 'Bravo Fest', eventDate: '2026-02-01' });
		await makeLeadFull(org, { eventName: 'Alpha Fest', eventDate: '2026-01-01' });
		await makeLeadFull(org, { eventName: 'Charlie Fest', eventDate: '2026-03-01' });

		const evAsc = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			sort: 'event',
			dir: 'asc'
		});
		const names = evAsc.leads.map((l) => l.eventName);
		expect(names).toEqual(['Alpha Fest', 'Bravo Fest', 'Charlie Fest']);

		const dateDesc = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			sort: 'eventDate',
			dir: 'desc'
		});
		expect(dateDesc.leads.map((l) => l.eventDate)).toEqual([
			'2026-03-01',
			'2026-02-01',
			'2026-01-01'
		]);
	});

	it('search narrows event-history rows (AC9)', async () => {
		const org = await makeOrganizerFull(`DetailSearch${Date.now()}`);
		await makeLeadFull(org, { eventName: 'Marathon Kickoff' });
		await makeLeadFull(org, { eventName: 'Gala Dinner' });

		const hit = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			search: 'marathon'
		});
		expect(hit.leads.length).toBe(1);
		expect(hit.leads[0].eventName).toBe('Marathon Kickoff');
	});

	it('country + owner + stage + search combine with AND (AC10)', async () => {
		const org = await makeOrganizerFull(`DetailMulti${Date.now()}`);
		const target = await makeLeadFull(org, {
			eventName: 'Target Event',
			country: 'Philippines',
			ownerId: MANAGER_UUID,
			stage: 'won'
		});
		// Decoys differing in exactly one dimension each.
		await makeLeadFull(org, { eventName: 'Target Event', country: 'Singapore', stage: 'won' });
		await makeLeadFull(org, {
			eventName: 'Target Event',
			country: 'Philippines',
			ownerId: REP_UUID,
			stage: 'won'
		});
		await makeLeadFull(org, {
			eventName: 'Target Event',
			country: 'Philippines',
			ownerId: MANAGER_UUID,
			stage: 'new'
		});

		const res = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			search: 'target',
			country: 'Philippines',
			owner: MANAGER_UUID,
			stage: 'won'
		});
		expect(res.leads.map((l) => l.id)).toEqual([target]);
	});

	it('visibilityCondition still excludes non-visible leads under filters (AC11)', async () => {
		const org = await makeOrganizerFull(`DetailVis${Date.now()}`);
		const restricted = await makeLeadFull(org, {
			eventName: 'Secret Launch',
			ownerId: MANAGER_UUID,
			visibility: 'only_me'
		});

		const repView = await listLinkedLeadsForOrganizer(org, REP_UUID, 'rep', {
			search: 'secret'
		});
		expect(repView.leads.some((l) => l.id === restricted)).toBe(false);

		const managerView = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			search: 'secret'
		});
		expect(managerView.leads.some((l) => l.id === restricted)).toBe(true);
	});

	it('paginates and reports post-filter total; page reset returns page 1 slice (AC12)', async () => {
		const org = await makeOrganizerFull(`DetailPage${Date.now()}`);
		for (let i = 0; i < 12; i++) {
			await makeLeadFull(org, { eventName: `Ev ${String(i).padStart(2, '0')}` });
		}
		const p1 = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			page: 1,
			pageSize: 10
		});
		expect(p1.total).toBe(12);
		expect(p1.leads.length).toBe(10);

		const p2 = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			page: 2,
			pageSize: 10
		});
		expect(p2.leads.length).toBe(2);
	});

	it('derives country + owner option lists from the unfiltered set', async () => {
		const org = await makeOrganizerFull(`DetailOpts${Date.now()}`);
		await makeLeadFull(org, { country: 'Philippines', ownerId: MANAGER_UUID });
		await makeLeadFull(org, { country: 'Singapore', ownerId: REP_UUID });
		// Filtering to one country must NOT shrink the option lists (derived pre-filter).
		const res = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager', {
			country: 'Philippines'
		});
		expect(res.countries).toEqual(['Philippines', 'Singapore']);
		expect(res.owners.length).toBe(2);
	});

	it('3-arg call still returns a plain Lead[] (backward compatible)', async () => {
		const org = await makeOrganizerFull(`DetailBackCompat${Date.now()}`);
		await makeLeadFull(org, { stage: 'new' });
		const leads = await listLinkedLeadsForOrganizer(org, MANAGER_UUID, 'manager');
		expect(Array.isArray(leads)).toBe(true);
	});
});
