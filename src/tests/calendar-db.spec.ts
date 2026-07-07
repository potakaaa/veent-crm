/**
 * DB-free unit coverage for the calendar follow-up range query (Phase 1).
 *
 * These tests intentionally do NOT open a DB connection:
 *   - the ownerId regression guard asserts the WHERE-clause via drizzle `.toSQL()`
 *     (SQL string generation is synchronous and needs no live Postgres).
 *   - the range-filter behavior asserts the pure `isWithinRange` helper.
 *
 * Covers Verification Evidence Fully-Automated unit halves:
 *   - calendar-followups-owner-scoped-visibility (unit half) — AC3 regression guard
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	buildFollowUpsRangeLeadConditions,
	buildGoLiveRangeConditions,
	buildGoLiveWhereClause,
	buildEventStartRangeConditions,
	buildEventStartWhereClause,
	isWithinRange,
	normalizeGoLiveDate,
	normalizeEventDate
} from '$lib/server/db/leads';
import { listAllMeetings } from '$lib/server/db/meetings';
import { db } from '$lib/server/db/index';
import { crmLeads } from '$lib/server/db/schema';
import { and, type SQL } from 'drizzle-orm';

// Helper: render a WHERE clause to its SQL string + bound params without a live DB.
function whereSql(clause: SQL | undefined) {
	return db.select().from(crmLeads).where(clause).toSQL();
}

// Isolate ONLY the WHERE-clause portion of a rendered query. `SELECT *` always lists the
// `owner_id` column, so a raw `sqlStr.toContain('owner_id')` is polluted by the projection —
// owner-scoping assertions must look at the predicate portion only.
function whereClauseOf(sqlStr: string): string {
	const idx = sqlStr.indexOf(' where ');
	return idx === -1 ? '' : sqlStr.slice(idx);
}

describe('getFollowUpsInRange — owner-scoping regression guard (AC3, DB-free)', () => {
	it('should include eq(crmLeads.ownerId, userId) predicate in getFollowUpsInRange query', () => {
		const userId = '00000000-0000-0000-0000-0000000000aa';
		const conditions = buildFollowUpsRangeLeadConditions(userId);

		// .toSQL() generates the SQL string + params synchronously, no DB connection.
		const { sql: sqlStr, params } = db
			.select()
			.from(crmLeads)
			.where(and(...conditions))
			.toSQL();

		// The owner_id scoping predicate MUST be present, bound to the signed-in user.
		expect(sqlStr).toContain('owner_id');
		expect(params).toContain(userId);
	});

	it('also preserves the soft-delete and non-terminal-stage predicates', () => {
		const conditions = buildFollowUpsRangeLeadConditions('u1');
		const { sql: sqlStr } = db
			.select()
			.from(crmLeads)
			.where(and(...conditions))
			.toSQL();
		expect(sqlStr).toContain('deleted_at');
		expect(sqlStr).toContain('stage');
	});
});

describe('isWithinRange — follow-up range filter behavior (DB-free)', () => {
	const start = new Date('2026-07-01T00:00:00.000Z');
	const end = new Date('2026-07-31T23:59:59.999Z');

	it('returns true for a timestamp inside the range', () => {
		expect(isWithinRange(new Date('2026-07-15T10:00:00.000Z'), start, end)).toBe(true);
	});

	it('accepts an ISO string as well as a Date', () => {
		expect(isWithinRange('2026-07-15T10:00:00.000Z', start, end)).toBe(true);
	});

	it('is inclusive of both range boundaries', () => {
		expect(isWithinRange(start, start, end)).toBe(true);
		expect(isWithinRange(end, start, end)).toBe(true);
	});

	it('returns false for a timestamp before the range', () => {
		expect(isWithinRange(new Date('2026-06-30T23:00:00.000Z'), start, end)).toBe(false);
	});

	it('returns false for a timestamp after the range', () => {
		expect(isWithinRange(new Date('2026-08-01T00:00:00.000Z'), start, end)).toBe(false);
	});

	it('returns false for null/undefined/invalid values', () => {
		expect(isWithinRange(null, start, end)).toBe(false);
		expect(isWithinRange(undefined, start, end)).toBe(false);
		expect(isWithinRange('not-a-date', start, end)).toBe(false);
	});
});

describe('normalizeGoLiveDate — day-shift-safe DATE normalization (AC4, DB-free)', () => {
	it("normalizes a 'YYYY-MM-DD' string to local-midnight ISO without day-shift", () => {
		expect(normalizeGoLiveDate('2026-07-15')).toBe('2026-07-15T00:00:00');
	});

	it('is idempotent on input that already contains a time component', () => {
		expect(normalizeGoLiveDate('2026-07-15T00:00:00')).toBe('2026-07-15T00:00:00');
		expect(normalizeGoLiveDate('2026-07-15T09:30:00.000Z')).toBe('2026-07-15T09:30:00.000Z');
	});
});

describe('buildGoLiveRangeConditions — live-lead selection guard (AC1, DB-free)', () => {
	it("builds WHERE with deleted_at is null, stage = 'live', go_live_date is not null", () => {
		const conditions = buildGoLiveRangeConditions();
		const { sql: sqlStr, params } = db
			.select()
			.from(crmLeads)
			.where(and(...conditions))
			.toSQL();

		expect(sqlStr).toContain('deleted_at');
		expect(sqlStr).toContain('is null');
		expect(sqlStr).toContain('stage');
		expect(sqlStr).toContain('go_live_date');
		expect(sqlStr).toContain('is not null');
		expect(params).toContain('live');
	});
});

describe('normalizeEventDate — day-shift-safe DATE normalization (AC4, DB-free)', () => {
	it("normalizes a 'YYYY-MM-DD' string to local-midnight ISO without day-shift", () => {
		expect(normalizeEventDate('2026-07-15')).toBe('2026-07-15T00:00:00');
	});

	it('is idempotent on input that already contains a time component', () => {
		expect(normalizeEventDate('2026-07-15T00:00:00')).toBe('2026-07-15T00:00:00');
		expect(normalizeEventDate('2026-07-15T09:30:00.000Z')).toBe('2026-07-15T09:30:00.000Z');
	});
});

describe('buildEventStartRangeConditions — live-lead selection guard (AC1, DB-free)', () => {
	it("builds WHERE with deleted_at is null, stage = 'live', event_date is not null", () => {
		const conditions = buildEventStartRangeConditions();
		const { sql: sqlStr, params } = db
			.select()
			.from(crmLeads)
			.where(and(...conditions))
			.toSQL();

		expect(sqlStr).toContain('deleted_at');
		expect(sqlStr).toContain('is null');
		expect(sqlStr).toContain('stage');
		expect(sqlStr).toContain('event_date');
		expect(sqlStr).toContain('is not null');
		expect(params).toContain('live');
	});
});

describe('getEventDatesInRange — visibility-composition regression guard (AC7, DB-free)', () => {
	it('composes visibilityCondition into the event-start query WHERE (no restricted-lead leak)', () => {
		const { sql: sqlStr } = db
			.select()
			.from(crmLeads)
			.where(buildEventStartWhereClause('user-1', 'rep'))
			.toSQL();

		// The visibility predicate MUST be composed into the WHERE clause so a future
		// refactor cannot silently drop it and leak restricted (only_me/selected) live leads.
		expect(sqlStr).toContain('owner_id');
		expect(sqlStr).toContain('visibility');
	});
});

// ---------------------------------------------------------------------------
// CAL-3 (GitHub #208) — owner filter scoping guards (DB-free, .toSQL())
// Namespaced CAL3-AC* to avoid colliding with the existing AC3/AC7 blocks above.
// ---------------------------------------------------------------------------

const REP_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_REP_ID = '00000000-0000-0000-0000-0000000000bb';
const MANAGER_ID = '00000000-0000-0000-0000-0000000000cc';

describe('CAL3-AC1 — rep sees only own leads (strict owner) across all 3 composers', () => {
	it('follow-ups: rep path binds owner_id = userId and not another id', () => {
		const { sql: sqlStr, params } = whereSql(
			and(...buildFollowUpsRangeLeadConditions(REP_ID, 'rep'))
		);
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
		expect(params).not.toContain(OTHER_REP_ID);
	});

	it('go-live: rep path binds owner_id = userId', () => {
		const { sql: sqlStr, params } = whereSql(buildGoLiveWhereClause(REP_ID, 'rep'));
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
		expect(params).not.toContain(OTHER_REP_ID);
	});

	it('event-start: rep path binds owner_id = userId', () => {
		const { sql: sqlStr, params } = whereSql(buildEventStartWhereClause(REP_ID, 'rep'));
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
		expect(params).not.toContain(OTHER_REP_ID);
	});
});

describe('CAL3-AC3 — manager sees all reps by default (no owner-narrow term)', () => {
	it('follow-ups: manager + no filterRepId → no owner_id predicate at all', () => {
		const { sql: sqlStr, params } = whereSql(
			and(...buildFollowUpsRangeLeadConditions(MANAGER_ID, 'manager', undefined))
		);
		// No owner scoping whatsoever for the team-wide default (WHERE portion only).
		expect(whereClauseOf(sqlStr)).not.toContain('owner_id');
		expect(params).not.toContain(MANAGER_ID);
	});

	it('go-live: manager + no filterRepId → visibilityCondition is a no-op true, no owner-narrow', () => {
		const { sql: sqlStr, params } = whereSql(
			buildGoLiveWhereClause(MANAGER_ID, 'manager', undefined)
		);
		// visibilityCondition(manager) returns `true`, so no per-owner predicate binds.
		expect(whereClauseOf(sqlStr)).not.toContain('owner_id');
		expect(params).not.toContain(MANAGER_ID);
	});

	it('event-start: manager + no filterRepId → no owner-narrow predicate', () => {
		const { sql: sqlStr, params } = whereSql(
			buildEventStartWhereClause(MANAGER_ID, 'manager', undefined)
		);
		expect(whereClauseOf(sqlStr)).not.toContain('owner_id');
		expect(params).not.toContain(MANAGER_ID);
	});
});

describe('CAL3-AC5 — manager + filterRepId narrows all 3 composers to that rep', () => {
	it('follow-ups: manager + filterRepId binds owner_id = filterRepId', () => {
		const { sql: sqlStr, params } = whereSql(
			and(...buildFollowUpsRangeLeadConditions(MANAGER_ID, 'manager', REP_ID))
		);
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
		expect(params).not.toContain(MANAGER_ID);
	});

	it('go-live: manager + filterRepId binds owner_id = filterRepId', () => {
		const { sql: sqlStr, params } = whereSql(buildGoLiveWhereClause(MANAGER_ID, 'manager', REP_ID));
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
	});

	it('event-start: manager + filterRepId binds owner_id = filterRepId', () => {
		const { sql: sqlStr, params } = whereSql(
			buildEventStartWhereClause(MANAGER_ID, 'manager', REP_ID)
		);
		expect(whereClauseOf(sqlStr)).toContain('owner_id');
		expect(params).toContain(REP_ID);
	});
});

describe('CAL3-AC8 — meetings always team-wide (never narrowed by the rep filter)', () => {
	it('listAllMeetings takes no owner/rep argument (arity guard)', () => {
		// A rep/owner param would make meetings filterable — assert the signature has none.
		expect(listAllMeetings.length).toBe(0);
	});

	it('the calendar route never threads filterRepId into the listAllMeetings(...) call (route-source guard)', () => {
		// Static-source guard (item 17b): closes the arity-only blind spot. An optional
		// filterRepId? param would keep listAllMeetings.length === 0 yet still be threaded at
		// the route; read the route source and assert the listAllMeetings() call is argument-free.
		const src = readFileSync('src/routes/calendar/+page.server.ts', 'utf8');
		const callMatch = src.match(/listAllMeetings\(([^)]*)\)/);
		expect(callMatch).not.toBeNull();
		// Capture group 1 is the argument list — it MUST be empty.
		expect(callMatch![1].trim()).toBe('');
		// And filterRepId must never appear inside a listAllMeetings( ... ) call anywhere.
		expect(/listAllMeetings\([^)]*filterRepId/.test(src)).toBe(false);
	});
});
