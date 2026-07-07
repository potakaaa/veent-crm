/**
 * Unit tests for editable lead categories (CAT-1, GitHub #248).
 *
 * DB-free pure-SQL assertions for `buildCategoryFilterConditions()` — serialized via
 * PgDialect (no DB connection needed). Proves the logic core of AC#5 (multi-select
 * category filter): empty → no restriction; single/multi id → an EXISTS subquery against
 * the crm_lead_categories join table using inArray over the category ids.
 */
import { describe, it, expect } from 'vitest';
import { buildCategoryFilterConditions } from '$lib/server/db/leads';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const dialect = new PgDialect();
const toSql = (s: SQL) => dialect.sqlToQuery(s).sql.toLowerCase();

const ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('buildCategoryFilterConditions SQL shape (CAT-1 AC#5)', () => {
	it('returns undefined for an empty array (no restriction)', () => {
		expect(buildCategoryFilterConditions([])).toBeUndefined();
	});

	it('builds an EXISTS subquery against the join table for a single id', () => {
		const cond = buildCategoryFilterConditions([ID_A]);
		expect(cond).toBeDefined();
		const sql = toSql(cond!);
		expect(sql).toContain('exists');
		expect(sql).toContain('crm_lead_categories');
		// Correlates the join row's lead_id back to the outer crm_leads row.
		expect(sql).toContain('"category_id"');
		expect(sql).toContain('"lead_id"');
	});

	it('builds an EXISTS with an inArray (IN (...)) predicate for multiple ids', () => {
		const cond = buildCategoryFilterConditions([ID_A, ID_B]);
		expect(cond).toBeDefined();
		const sql = toSql(cond!);
		expect(sql).toContain('exists');
		expect(sql).toContain('crm_lead_categories');
		// inArray over N ids serializes to `... in ($1, $2)`.
		expect(sql).toContain(' in (');
	});

	it('single-id and multi-id both remain EXISTS subqueries (OR-within-filter semantics)', () => {
		expect(toSql(buildCategoryFilterConditions([ID_A])!)).toContain('exists');
		expect(toSql(buildCategoryFilterConditions([ID_A, ID_B])!)).toContain('exists');
	});
});
