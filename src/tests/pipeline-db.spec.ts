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
import {
	createLead,
	getLead,
	moveLeadStage,
	reassignLead,
	buildPipelineStageWhereClause
} from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { eq, type SQL } from 'drizzle-orm';
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

// ---------------------------------------------------------------------------
// PIPE-4 — buildPipelineStageWhereClause owner-scoping guards (DB-free, .toSQL())
//
// These tests intentionally do NOT open a DB connection: drizzle `.toSQL()` renders the
// WHERE clause + bound params synchronously, needing no live Postgres (proven by
// calendar-db.spec.ts running the same pattern un-skipped in CI). This block is therefore
// deliberately NOT wrapped in describe.skipIf(SKIP_DB) — the security-critical query
// composition (a rep's own-leads restriction can never be widened by a stray filterRepId)
// must be proven Fully-Automated in every CI run, live DB or not.
// ---------------------------------------------------------------------------

const REP_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_REP_ID = '00000000-0000-0000-0000-0000000000bb';
const MGR_ID = '00000000-0000-0000-0000-0000000000cc';

// Render a WHERE clause to its SQL string + bound params without a live DB.
function whereSql(clause: SQL | undefined) {
	return db.select().from(crmLeads).where(clause).toSQL();
}

// Isolate ONLY the WHERE-clause portion. `SELECT *` always lists the `owner_id` column, so a
// raw `.toContain('owner_id')` is polluted by the projection — owner-scoping assertions must
// look at the predicate portion only.
function whereClauseOf(sqlStr: string): string {
	const idx = sqlStr.indexOf(' where ');
	return idx === -1 ? '' : sqlStr.slice(idx);
}

function ownerPredicateCount(where: string): number {
	return where.match(/\bowner_id\b/g)?.length ?? 0;
}

describe('buildPipelineStageWhereClause — DB-free', () => {
	it('(a) rep → own-scoped; a stray filterRepId never widens (filterRepId ignored)', () => {
		const withStray = whereSql(buildPipelineStageWhereClause(REP_ID, 'rep', 'new', OTHER_REP_ID));
		const withoutStray = whereSql(buildPipelineStageWhereClause(REP_ID, 'rep', 'new'));
		// A stray filterRepId must produce the IDENTICAL WHERE as no filter — never widened,
		// never narrowed to the OTHER rep's id.
		expect(withStray.sql).toBe(withoutStray.sql);
		expect(withStray.params).not.toContain(OTHER_REP_ID);
		// visibilityCondition('rep') binds the signed-in user's own id (owner=me leak guard).
		const where = whereClauseOf(withStray.sql);
		expect(where).toContain('owner_id');
		expect(withStray.params).toContain(REP_ID);
	});

	it('(b) manager + no filter → no owner-narrow predicate (team-wide)', () => {
		const { sql: sqlStr, params } = whereSql(
			buildPipelineStageWhereClause(MGR_ID, 'manager', 'new')
		);
		// visibilityCondition(manager) returns `true`, so no per-owner predicate binds.
		expect(whereClauseOf(sqlStr)).not.toContain('owner_id');
		expect(params).not.toContain(MGR_ID);
	});

	it('(c) manager + valid filterRepId → owner_id predicate bound to filterRepId, ANDed', () => {
		const { sql: sqlStr, params } = whereSql(
			buildPipelineStageWhereClause(MGR_ID, 'manager', 'new', REP_ID)
		);
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
		// The composition is a single AND of predicates — no OR that could widen the view.
		expect(sqlStr).not.toContain(' or ');
	});

	it('(d) super_manager + valid filterRepId → scoped identically to manager', () => {
		const { sql: sqlStr, params } = whereSql(
			buildPipelineStageWhereClause(MGR_ID, 'super_manager', 'new', REP_ID)
		);
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
	});

	it('(e) composition is AND, never OR — rep restriction cannot be widened by a stray filterRepId', () => {
		// Rep path: exactly the visibilityCondition owner guard, never a second owner-narrow that
		// a filterRepId might have introduced. And no top-level OR joining the manager filter.
		const { sql: sqlStr } = whereSql(
			buildPipelineStageWhereClause(REP_ID, 'rep', 'new', OTHER_REP_ID)
		);
		const where = whereClauseOf(sqlStr);
		// visibilityCondition('rep') internally ORs owner/visibility/grant checks — that is the
		// leak guard, expected. The point: the filterRepId branch added ZERO extra owner predicate
		// for a rep, so owner_id count matches the no-filter rep clause exactly.
		const noFilter = whereClauseOf(
			whereSql(buildPipelineStageWhereClause(REP_ID, 'rep', 'new')).sql
		);
		expect(ownerPredicateCount(where)).toBe(ownerPredicateCount(noFilter));
	});

	// -------------------------------------------------------------------------
	// pipeline-search-server-reach (PIPE-3 follow-up) — server-side search predicate.
	// Proves the 3-field ILIKE renders, composes with the rep filter as an AND, and
	// escapes LIKE metacharacters — all DB-free via drizzle .toSQL().
	// -------------------------------------------------------------------------

	it('(f) search term present → WHERE renders 3-field ILIKE over name, organizers.name, event_name', () => {
		const { sql: sqlStr, params } = whereSql(
			buildPipelineStageWhereClause(REP_ID, 'rep', 'new', undefined, 'acme')
		);
		const where = whereClauseOf(sqlStr);
		expect(where).toContain('ilike');
		// All three search fields are referenced in the predicate.
		expect(where).toContain('name'); // crmLeads.name (+ organizers.name)
		expect(where).toContain('organizers'); // COALESCE(organizers.name, '')
		expect(where).toContain('event_name'); // COALESCE(crmLeads.eventName, '')
		// Bound param is the wrapped like pattern for the search term.
		expect(params).toContain('%acme%');
	});

	it('(g) search + valid manager filterRepId → owner_id predicate AND the three ILIKE fields (compose as AND)', () => {
		const { sql: sqlStr, params } = whereSql(
			buildPipelineStageWhereClause(MGR_ID, 'manager', 'new', REP_ID, 'acme')
		);
		const where = whereClauseOf(sqlStr);
		// Rep-filter owner-narrow present…
		expect(where).toContain('owner_id');
		expect(params).toContain(REP_ID);
		// …AND the search ILIKE fields present — both terms compose in the same conditions array.
		expect(where).toContain('ilike');
		expect(params).toContain('%acme%');
	});

	it('(h) search term with % _ \\ renders a backslash-escaped bound param (LIKE-metachar escaping)', () => {
		const { params } = whereSql(
			buildPipelineStageWhereClause(REP_ID, 'rep', 'new', undefined, 'a%b_c\\d')
		);
		// escapeLike replaces \, %, _ with a backslash-prefixed copy, then wraps in %…%.
		// 'a%b_c\d' → 'a\%b\_c\\d' → '%a\%b\_c\\d%'
		const expected = '%a\\%b\\_c\\\\d%';
		expect(params).toContain(expected);
	});
});
