/**
 * DB integration tests for the manager dashboard aggregations (GitHub #244 / DASH-1).
 * Covers AC2-data, AC3, AC4, AC6.
 *
 * Prerequisites:
 *   docker compose up -d db && bun run db:push
 * Skipped when DATABASE_URL is not set (no postgres service in CI). Run locally with:
 *   bun run test:unit:ci -- src/tests/dashboard-db.spec.ts
 *
 * Strategy: seed two BRAND-NEW active rep-role AEs (Alpha, Beta) and attach all fixtures
 * to them, so their aggregated numbers depend ONLY on this test's seeded data and can be
 * hand-calculated deterministically against a shared DB with pre-existing rows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLead } from '$lib/server/db/leads';
import { getDashboardData } from '$lib/server/db/dashboard';
import { db } from '$lib/server/db/index';
import { crmUsers, crmLeads, crmActivities, crmLeadHistory } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const TEST_PREFIX = '__dashboardtest__';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

const createdLeadIds: string[] = [];
const createdUserIds: string[] = [];

let aeAId = '';
let aeBId = '';
let aeGId = '';

async function makeAe(label: string): Promise<string> {
	const [row] = await db
		.insert(crmUsers)
		.values({ name: `${TEST_PREFIX} ${label}`, role: 'rep', active: true, email: null })
		.returning();
	createdUserIds.push(row.id);
	return row.id;
}

async function makeLead(
	name: string,
	ownerId: string,
	opts: {
		stage?: 'new' | 'contacted' | 'won';
		createdAt?: Date;
		deletedAt?: Date;
	} = {}
): Promise<string> {
	const lead = await createLead({ name: `${TEST_PREFIX} ${name}`, category: 'Sports' }, ownerId);
	createdLeadIds.push(lead.id);
	const patch: Record<string, unknown> = {};
	if (opts.stage) patch.stage = opts.stage;
	if (opts.createdAt) patch.createdAt = opts.createdAt;
	if (opts.deletedAt) patch.deletedAt = opts.deletedAt;
	if (Object.keys(patch).length > 0) {
		await db.update(crmLeads).set(patch).where(eq(crmLeads.id, lead.id));
	}
	return lead.id;
}

async function wonTransition(leadId: string, at: Date) {
	await db.insert(crmLeadHistory).values({ leadId, field: 'stage', newValue: 'won', at });
}

/** Generic stage→newValue transition row (audit trail) at a given time. */
async function stageTransition(leadId: string, newValue: string, at: Date) {
	await db.insert(crmLeadHistory).values({ leadId, field: 'stage', newValue, at });
}

async function activity(leadId: string, repId: string, occurredAt: Date, followUpAt?: Date) {
	await db.insert(crmActivities).values({
		leadId,
		repId,
		channel: 'fb_dm',
		occurredAt,
		followUpAt: followUpAt ?? null
	});
}

beforeAll(async () => {
	if (SKIP_DB) return;

	aeAId = await makeAe('AE Alpha');
	aeBId = await makeAe('AE Beta');
	aeGId = await makeAe('AE Gamma');

	// --- AE Alpha fixtures -------------------------------------------------
	// 1. wonRecent — stage won; TWO won-transitions (now-60d and now). DISTINCT ON must
	//    pick the latest (now) → counts inside week/month (regression guard for latest-wins).
	const wonRecent = await makeLead('Won Recent', aeAId, { stage: 'won' });
	await wonTransition(wonRecent, daysAgo(60));
	await wonTransition(wonRecent, new Date());

	// 2. wonOld — stage won; single won-transition 60d ago (all-time only).
	const wonOld = await makeLead('Won Old', aeAId, { stage: 'won' });
	await wonTransition(wonOld, daysAgo(60));

	// 3. adhOnTime — first touch schedules a follow-up (due 6d ago); a later touch (8d ago)
	//    landed before it was due → on_time. (next_at <= follow_up_at)
	const adhOnTime = await makeLead('Adh OnTime', aeAId, { stage: 'contacted' });
	await activity(adhOnTime, aeAId, daysAgo(10), daysAgo(6));
	await activity(adhOnTime, aeAId, daysAgo(8));

	// 4. adhLate — next touch (3d ago) landed after the follow-up was due (6d ago) → late.
	const adhLate = await makeLead('Adh Late', aeAId, { stage: 'contacted' });
	await activity(adhLate, aeAId, daysAgo(10), daysAgo(6));
	await activity(adhLate, aeAId, daysAgo(3));

	// 5. adhMissed — a single touch with a past-due follow-up and no next touch → missed.
	const adhMissed = await makeLead('Adh Missed', aeAId, { stage: 'contacted' });
	await activity(adhMissed, aeAId, daysAgo(10), daysAgo(3));

	// 6. adhPending — a single touch with a future follow-up, no next touch → pending (excluded).
	const adhPending = await makeLead('Adh Pending', aeAId, { stage: 'new' });
	await activity(adhPending, aeAId, daysAgo(1), daysAhead(5));

	// 7. oldCreated — created 60d ago; in all-time added but not this month/week.
	await makeLead('Old Created', aeAId, { stage: 'new', createdAt: daysAgo(60) });

	// 8. softDeleted — stage won, has a won-transition now, but soft-deleted → excluded everywhere.
	const softDeleted = await makeLead('Soft Deleted', aeAId, {
		stage: 'won',
		deletedAt: new Date()
	});
	await wonTransition(softDeleted, new Date());

	// --- AE Beta fixtures (minimal — proves per-AE isolation + presence) ---
	await makeLead('Beta Lead', aeBId, { stage: 'new' });

	// --- AE Gamma fixtures (dedicated to the range-scoped stage-distribution logic) ---
	// Kept off Alpha on purpose so Alpha's hand-calculated owned/added/won numbers stay stable.
	// Each lead's "stage-entered" timestamp (latest crm_lead_history stage→current-stage row, else
	// created_at) is what decides range membership — NOT the creation date when a transition exists.

	// (a) fallback → creation date: no stage-transition rows, so entered_at = created_at.
	// gFallbackIn created "now" → counts in every range. gFallbackOut created 400d ago → 'all' only.
	await makeLead('G Fallback In', aeGId, { stage: 'new' });
	await makeLead('G Fallback Out', aeGId, { stage: 'new', createdAt: daysAgo(400) });

	// (b) transition date wins over creation date.
	// gTransitionIn: created 400d ago but transitioned INTO 'contacted' now → entered_at = now →
	//   counts in week/month/year (proves an old lead that moved recently reads as "recent").
	const gTransitionIn = await makeLead('G Transition In', aeGId, {
		stage: 'contacted',
		createdAt: daysAgo(400)
	});
	await stageTransition(gTransitionIn, 'contacted', new Date());

	// gTransitionOut: created "now" but its only 'contacted' transition is 400d ago →
	//   entered_at = 400d ago → 'all' only (proves a freshly-created lead whose stage-entry is old
	//   drops out of narrow ranges).
	const gTransitionOut = await makeLead('G Transition Out', aeGId, { stage: 'contacted' });
	await stageTransition(gTransitionOut, 'contacted', daysAgo(400));
});

afterAll(async () => {
	if (createdLeadIds.length > 0) {
		// Activities + history cascade-delete from the lead FK.
		await db.delete(crmLeads).where(inArray(crmLeads.id, createdLeadIds));
	}
	if (createdUserIds.length > 0) {
		await db.delete(crmUsers).where(inArray(crmUsers.id, createdUserIds));
	}
});

describe.skipIf(SKIP_DB)('getDashboardData — per-AE aggregation (DB)', () => {
	it('AC2-data: every active rep-role AE is present in the output', async () => {
		const { rows } = await getDashboardData('all', { pageSize: 1000 });
		expect(rows.find((r) => r.id === aeAId)).toBeDefined();
		expect(rows.find((r) => r.id === aeBId)).toBeDefined();
	});

	it('AC3: Alpha per-field numbers match hand-calculated expectations (range=all)', async () => {
		const { rows } = await getDashboardData('all', { pageSize: 1000 });
		const a = rows.find((r) => r.id === aeAId)!;
		expect(a.leadsOwned).toBe(7); // 8 seeded, 1 soft-deleted excluded
		expect(a.stageDistribution).toMatchObject({ won: 2, contacted: 3, new: 2 });
		expect(a.wonAllTime).toBe(2);
		expect(a.wonInRange).toBe(2);
		expect(a.leadsAddedInRange).toBe(7);
		// on_time=1, late=1, missed=1, pending excluded → round(1/3*100) = 33
		expect(a.adherencePct).toBe(33);
	});

	it('AC6: soft-deleted won lead is excluded from owned + won metrics', async () => {
		const { rows } = await getDashboardData('all', { pageSize: 1000 });
		const a = rows.find((r) => r.id === aeAId)!;
		// A 3rd won lead exists but is soft-deleted; wonAllTime stays 2, leadsOwned stays 7.
		expect(a.wonAllTime).toBe(2);
		expect(a.leadsOwned).toBe(7);
	});

	it('AC4: range switching changes range-bound numbers but not all-time numbers', async () => {
		const all = (await getDashboardData('all', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;
		const month = (await getDashboardData('month', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;

		// Range-bound metrics shrink for the narrower window.
		expect(all.wonInRange).toBe(2);
		expect(month.wonInRange).toBe(1); // only the now-dated won transition (latest-wins guard)
		expect(all.leadsAddedInRange).toBe(7);
		expect(month.leadsAddedInRange).toBe(6); // the 60d-old lead drops out

		// All-time metrics are identical across ranges.
		expect(month.wonAllTime).toBe(all.wonAllTime);
		expect(month.leadsOwned).toBe(all.leadsOwned);
	});

	it('AC4: range=year bounds numbers to the current calendar year', async () => {
		const all = (await getDashboardData('all', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;
		const year = (await getDashboardData('year', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;

		// The only fixture dates that can cross the Jan-1 year boundary are the daysAgo(60)
		// won-transition (wonOld) and the daysAgo(60) creation (oldCreated). Compute whether
		// 60 days ago still lands inside the current calendar year, then derive expectations
		// the same way the fixture dates are derived (relative, not hardcoded absolutes).
		const sixtyDaysAgoInThisYear = daysAgo(60).getFullYear() === new Date().getFullYear();

		// wonInRange(year): wonRecent's latest transition is "now" (always this year); wonOld's
		// single transition is 60d ago (this year only when it hasn't crossed Jan 1).
		expect(year.wonInRange).toBe(sixtyDaysAgoInThisYear ? 2 : 1);

		// leadsAddedInRange(year): 6 leads created "now" + oldCreated (60d ago) when in-year.
		expect(year.leadsAddedInRange).toBe(sixtyDaysAgoInThisYear ? 7 : 6);

		// All-time metrics are identical across ranges.
		expect(year.wonAllTime).toBe(all.wonAllTime);
		expect(year.leadsOwned).toBe(all.leadsOwned);
	});

	it('per-AE isolation: Beta metrics are independent of Alpha', async () => {
		const { rows } = await getDashboardData('all', { pageSize: 1000 });
		const b = rows.find((r) => r.id === aeBId)!;
		expect(b.leadsOwned).toBe(1);
		expect(b.wonAllTime).toBe(0);
		expect(b.wonInRange).toBe(0);
		expect(b.adherencePct).toBe(0);
	});

	it('search: filters the AE roster by name and total reflects the filtered count', async () => {
		// Alpha's seeded name contains "AE Alpha"; search for its unique suffix.
		const { rows, total } = await getDashboardData('all', { search: 'AE Alpha', pageSize: 1000 });
		expect(rows.every((r) => r.name.includes('AE Alpha'))).toBe(true);
		expect(rows.find((r) => r.id === aeAId)).toBeDefined();
		expect(rows.find((r) => r.id === aeBId)).toBeUndefined();
		expect(total).toBe(rows.length);
		expect(total).toBeGreaterThanOrEqual(1);
	});

	it('stage distribution is range-scoped: Alpha chips shrink for the narrower window', async () => {
		const all = (await getDashboardData('all', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;
		const month = (await getDashboardData('month', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeAId
		)!;

		// range=all counts every current-stage lead (same as the legacy snapshot).
		expect(all.stageDistribution).toMatchObject({ won: 2, contacted: 3, new: 2 });
		// range=month: wonOld (won-transition 60d ago) and oldCreated (created 60d ago, no
		// transition → falls back to creation) both drop out; everything created "now" stays.
		expect(month.stageDistribution).toMatchObject({ won: 1, contacted: 3, new: 1 });
	});

	it('stage distribution uses stage-entry date, not creation date (Gamma)', async () => {
		const all = (await getDashboardData('all', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeGId
		)!;
		const month = (await getDashboardData('month', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeGId
		)!;
		const year = (await getDashboardData('year', { pageSize: 1000 })).rows.find(
			(r) => r.id === aeGId
		)!;

		// all: both new leads + both contacted leads counted regardless of when they entered.
		expect(all.stageDistribution).toMatchObject({ new: 2, contacted: 2 });

		// month: only entered-"now" leads survive — gFallbackIn (new) and gTransitionIn (contacted,
		// created 400d ago but transitioned now). gFallbackOut and gTransitionOut (entered 400d ago,
		// the latter despite being created "now") drop out. Proves transition date beats creation.
		expect(month.stageDistribution).toMatchObject({ new: 1, contacted: 1 });

		// year: same split — the 400d-ago stage-entries are outside the current calendar year.
		expect(year.stageDistribution).toMatchObject({ new: 1, contacted: 1 });
	});

	it('pagination: pageSize limits rows.length while total stays the full filtered count', async () => {
		// Scope to this test's three seeded AEs (all share TEST_PREFIX) so counts are deterministic.
		const p1 = await getDashboardData('all', { search: TEST_PREFIX, page: 1, pageSize: 1 });
		const p2 = await getDashboardData('all', { search: TEST_PREFIX, page: 2, pageSize: 1 });

		// total is the FULL filtered count (all three seeded AEs), constant across pages.
		expect(p1.total).toBe(3);
		expect(p2.total).toBe(3);

		// pageSize caps each page to a single row, and the two pages return different AEs.
		expect(p1.rows.length).toBe(1);
		expect(p2.rows.length).toBe(1);
		expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
	});
});
