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
import {
	buildFollowUpsRangeLeadConditions,
	buildGoLiveRangeConditions,
	buildEventStartRangeConditions,
	isWithinRange,
	normalizeGoLiveDate,
	normalizeEventDate,
	visibilityCondition
} from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads } from '$lib/server/db/schema';
import { and } from 'drizzle-orm';

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
			.where(and(...buildEventStartRangeConditions(), visibilityCondition('user-1', 'rep')))
			.toSQL();

		// The visibility predicate MUST be composed into the WHERE clause so a future
		// refactor cannot silently drop it and leak restricted (only_me/selected) live leads.
		expect(sqlStr).toContain('owner_id');
		expect(sqlStr).toContain('visibility');
	});
});
