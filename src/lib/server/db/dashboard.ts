/**
 * Server-side DB access for the manager performance dashboard (GitHub #244 / DASH-1).
 *
 * One function per metric plus a composed `getDashboardData(range)` entrypoint.
 * All lead-based queries filter `deleted_at IS NULL` (soft-delete discipline).
 * This module is read-only: it never writes, never touches `mock.ts`, and never
 * imports from `reports/+page.server.ts` (the small won-count query is duplicated
 * here on purpose so `/reports` stays untouched).
 */
import { db } from './index';
import { crmLeads, crmUsers, crmLeadHistory } from './schema';
import { eq, isNull, and, or, count, desc, gte, sql, ilike } from 'drizzle-orm';
import { formatFullName } from '$lib/utils/format-name';

/** The four date-range buckets the dashboard supports. */
export type DashboardRange = 'week' | 'month' | 'year' | 'all';

/** One dashboard row — one active rep-role AE. */
export interface AeDashboardRow {
	id: string;
	name: string;
	leadsOwned: number;
	/**
	 * Range-scoped pipeline-stage distribution: per-stage count of the AE's leads that most
	 * recently entered their CURRENT stage within the selected range (falling back to the lead's
	 * creation date when the stage was never logged as a transition). Changes with the range picker.
	 */
	stageDistribution: Record<string, number>;
	wonAllTime: number;
	wonInRange: number;
	/** on-time / (on-time + late + missed), 0-100 rounded; 0 when no classified follow-ups. */
	adherencePct: number;
	leadsAddedInRange: number;
	/** Sum of `revenue_cents` for leads CURRENTLY in `done` whose most-recent stage→`done`
	 * transition falls in the selected range (GitHub #273 AC5/AC6). Raw cents, single currency
	 * (PHP) assumed in practice — see `getRevenuePerAe`. */
	revenueCentsInRange: number;
}

/**
 * Lower bound (inclusive) for a range bucket, or `null` for "all time" (no bound).
 * Pure + exported so it is unit-testable without a DB connection.
 *  - `week`  = start of the current ISO week (Monday) at local midnight
 *  - `month` = start of the current calendar month at local midnight
 *  - `year`  = start of the current calendar year (Jan 1) at local midnight
 *  - `all`   = null
 */
export function rangeToStartDate(range: DashboardRange): Date | null {
	if (range === 'all') return null;
	const now = new Date();
	if (range === 'year') {
		return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
	}
	if (range === 'month') {
		return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
	}
	// week — roll back to Monday of the current week
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
	const day = d.getDay(); // 0 = Sun … 6 = Sat
	const daysSinceMonday = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - daysSinceMonday);
	return d;
}

/**
 * Active rep-role AEs (managers/super-managers are not AEs and never appear as rows).
 * Optional `search` filters by AE name (case-insensitive `ilike`, LIKE metacharacters
 * escaped so literal input never acts as a wildcard). The full filtered, name-ordered
 * set is fetched first (small — only active reps), then sliced by page/pageSize (default
 * page 1, 12 per page). Returns `{ aes, total }` where `total` is the full filtered count.
 */
export async function getActiveAeList(
	opts: { search?: string; page?: number; pageSize?: number } = {}
): Promise<{ aes: { id: string; name: string }[]; total: number }> {
	const { search, page = 1, pageSize = 12 } = opts;

	const conds = [eq(crmUsers.role, 'rep'), eq(crmUsers.active, true)];
	const term = (search ?? '').trim();
	if (term) {
		const escaped = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
		conds.push(or(ilike(crmUsers.firstName, escaped), ilike(crmUsers.lastName, escaped))!);
	}

	const rows = await db
		.select({ id: crmUsers.id, firstName: crmUsers.firstName, lastName: crmUsers.lastName })
		.from(crmUsers)
		.where(and(...conds))
		.orderBy(crmUsers.firstName);

	const filtered = rows.map((r) => ({ id: r.id, name: formatFullName(r.firstName, r.lastName) }));

	const total = filtered.length;
	const start = (page - 1) * pageSize;
	const aes = filtered.slice(start, start + pageSize);
	return { aes, total };
}

/** Leads owned per AE (non-deleted). Map keyed by ownerId. */
export async function getLeadsOwnedPerAe(): Promise<Map<string, number>> {
	const rows = await db
		.select({ ownerId: crmLeads.ownerId, n: count() })
		.from(crmLeads)
		.where(isNull(crmLeads.deletedAt))
		.groupBy(crmLeads.ownerId);
	return toOwnerCountMap(rows);
}

/**
 * Range-scoped pipeline-stage distribution per AE (non-deleted). Map: ownerId → { stage → count }.
 *
 * For each lead we compute its "stage-entered" timestamp: the most recent `crm_lead_history`
 * row where `field = 'stage'` and `new_value` equals the lead's CURRENT stage (i.e. when it most
 * recently entered the stage it is currently in). When no such history row exists — common for
 * leads still in their creation stage, since the initial stage is never logged as a transition —
 * we fall back to the lead's `created_at`. Leads are counted per (ownerId, stage) when that
 * "stage-entered" timestamp falls within the range boundary (all leads for range='all').
 *
 * Uses raw `sql` (Drizzle has no builder for this "latest matching value or fallback" pattern).
 * The range boundary is passed via tagged-template parameter interpolation — never
 * string-concatenated (E2), matching `getFollowUpAdherencePerAe`.
 */
export async function getStageDistributionInRangePerAe(
	range: DashboardRange
): Promise<Map<string, Record<string, number>>> {
	const start = rangeToStartDate(range);

	const query = sql`
		WITH stage_entry AS (
			SELECT
				l.id AS lead_id,
				l.owner_id,
				l.stage,
				COALESCE(
					(
						SELECT MAX(h.at)
						FROM crm_lead_history h
						WHERE h.lead_id = l.id AND h.field = 'stage' AND h.new_value = l.stage::text
					),
					l.created_at
				) AS entered_at
			FROM crm_leads l
			WHERE l.deleted_at IS NULL
		)
		SELECT owner_id, stage, COUNT(*) AS n
		FROM stage_entry
		WHERE (${start}::timestamptz IS NULL OR entered_at >= ${start}::timestamptz)
		GROUP BY owner_id, stage
	`;

	const result = await db.execute(query);
	const rows = normalizeRows<{ owner_id: string | null; stage: string; n: number | string }>(
		result
	);

	const map = new Map<string, Record<string, number>>();
	for (const r of rows) {
		if (!r.owner_id) continue;
		const dist = map.get(r.owner_id) ?? {};
		dist[r.stage] = Number(r.n);
		map.set(r.owner_id, dist);
	}
	return map;
}

/**
 * Won-all-time per AE (non-deleted, current stage = 'won'). Mirrors the `/reports`
 * leaderboard wins query shape — duplicated here so `/reports` is not imported/modified.
 */
export async function getWonAllTimePerAe(): Promise<Map<string, number>> {
	const rows = await db
		.select({ ownerId: crmLeads.ownerId, n: count() })
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
		.groupBy(crmLeads.ownerId);
	return toOwnerCountMap(rows);
}

/**
 * Won-in-range per AE. Uses the most-recent stage→'won' transition per lead (from the
 * audit trail) as the "won date", then filters that date into the range boundary.
 *
 * Implemented with Drizzle's native `.selectDistinctOn()` builder (E1 — same idiom used
 * for the "latest activity per lead" pattern in `leads.ts`), NOT a raw `sql` DISTINCT ON
 * template. Ordering by `at DESC` picks the latest transition when a lead flips stages
 * more than once.
 */
export async function getWonInRangePerAe(range: DashboardRange): Promise<Map<string, number>> {
	const start = rangeToStartDate(range);

	const transitions = await db
		.selectDistinctOn([crmLeadHistory.leadId], {
			leadId: crmLeadHistory.leadId,
			at: crmLeadHistory.at,
			ownerId: crmLeads.ownerId
		})
		.from(crmLeadHistory)
		.innerJoin(crmLeads, eq(crmLeadHistory.leadId, crmLeads.id))
		.where(
			and(
				eq(crmLeadHistory.field, 'stage'),
				eq(crmLeadHistory.newValue, 'won'),
				isNull(crmLeads.deletedAt)
			)
		)
		.orderBy(crmLeadHistory.leadId, desc(crmLeadHistory.at));

	const map = new Map<string, number>();
	for (const t of transitions) {
		if (!t.ownerId) continue;
		if (start && (!t.at || t.at < start)) continue;
		map.set(t.ownerId, (map.get(t.ownerId) ?? 0) + 1);
	}
	return map;
}

/**
 * Post-event revenue per AE (GitHub #273 AC5/AC6). Mirrors `getWonInRangePerAe`'s
 * `.selectDistinctOn()` shape exactly, but sums `revenue_cents` instead of counting, and
 * adds a mandatory CURRENT-STAGE guard (`eq(crmLeads.stage, 'done')`, E2): `done` is NOT
 * terminal (a lead may move on afterward via the generic `moveLeadStage` clearing branch,
 * which does not null `revenueCents`), so without this guard a done→moved-out lead would
 * keep both its `revenue_cents` value and its stale done-transition history row and be
 * double-counted despite no longer being "in Done". `getWonInRangePerAe` carries the same
 * latent inaccuracy for `won` — intentionally NOT retrofitted here (out of scope for #273).
 */
export async function getRevenuePerAe(range: DashboardRange): Promise<Map<string, number>> {
	const start = rangeToStartDate(range);

	const transitions = await db
		.selectDistinctOn([crmLeadHistory.leadId], {
			leadId: crmLeadHistory.leadId,
			at: crmLeadHistory.at,
			ownerId: crmLeads.ownerId,
			revenueCents: crmLeads.revenueCents
		})
		.from(crmLeadHistory)
		.innerJoin(crmLeads, eq(crmLeadHistory.leadId, crmLeads.id))
		.where(
			and(
				eq(crmLeadHistory.field, 'stage'),
				eq(crmLeadHistory.newValue, 'done'),
				eq(crmLeads.stage, 'done'), // E2 — only leads CURRENTLY in `done` contribute
				isNull(crmLeads.deletedAt)
			)
		)
		.orderBy(crmLeadHistory.leadId, desc(crmLeadHistory.at));

	const map = new Map<string, number>();
	for (const t of transitions) {
		if (!t.ownerId || t.revenueCents == null) continue;
		if (start && (!t.at || t.at < start)) continue;
		map.set(t.ownerId, (map.get(t.ownerId) ?? 0) + t.revenueCents);
	}
	return map;
}

/**
 * Follow-up adherence per AE. For each activity that scheduled a follow-up
 * (`follow_up_at IS NOT NULL`), the next activity on the same lead (window `LEAD()`)
 * decides the classification:
 *  - on-time — a next touch occurred at/before the follow-up was due
 *  - late    — a next touch occurred after the follow-up was due
 *  - missed  — no next touch AND the follow-up is already past due
 *  - pending — no next touch AND the follow-up is still in the future (excluded)
 *
 * adherence% = on_time / (on_time + late + missed), grouped by rep. Uses raw `sql`
 * because Drizzle has no first-class `LEAD() OVER` builder. All dynamic values (the
 * range boundary date) are passed via tagged-template parameter interpolation — never
 * string-concatenated (E2).
 */
export async function getFollowUpAdherencePerAe(
	range: DashboardRange
): Promise<Map<string, number>> {
	const start = rangeToStartDate(range);

	const query = sql`
		WITH touch AS (
			SELECT
				a.rep_id AS rep_id,
				a.follow_up_at AS follow_up_at,
				LEAD(a.occurred_at) OVER (PARTITION BY a.lead_id ORDER BY a.occurred_at) AS next_at
			FROM crm_activities a
			JOIN crm_leads l ON l.id = a.lead_id
			WHERE l.deleted_at IS NULL
		),
		classified AS (
			SELECT
				rep_id,
				CASE
					WHEN next_at IS NOT NULL AND next_at <= follow_up_at THEN 'on_time'
					WHEN next_at IS NOT NULL AND next_at > follow_up_at THEN 'late'
					WHEN next_at IS NULL AND follow_up_at < now() THEN 'missed'
					ELSE 'pending'
				END AS status
			FROM touch
			WHERE follow_up_at IS NOT NULL
				AND (${start}::timestamptz IS NULL OR follow_up_at >= ${start}::timestamptz)
		)
		SELECT
			rep_id,
			COUNT(*) FILTER (WHERE status = 'on_time') AS on_time,
			COUNT(*) FILTER (WHERE status = 'late') AS late,
			COUNT(*) FILTER (WHERE status = 'missed') AS missed
		FROM classified
		WHERE status <> 'pending'
		GROUP BY rep_id
	`;

	const result = await db.execute(query);
	const rows = normalizeRows<{
		rep_id: string | null;
		on_time: number | string;
		late: number | string;
		missed: number | string;
	}>(result);

	const map = new Map<string, number>();
	for (const r of rows) {
		if (!r.rep_id) continue;
		const onTime = Number(r.on_time);
		const denom = onTime + Number(r.late) + Number(r.missed);
		map.set(r.rep_id, denom > 0 ? Math.round((onTime / denom) * 100) : 0);
	}
	return map;
}

/** Leads added per AE within the range (non-deleted, created_at >= range start). */
export async function getLeadsAddedInRangePerAe(
	range: DashboardRange
): Promise<Map<string, number>> {
	const start = rangeToStartDate(range);
	const conds = [isNull(crmLeads.deletedAt)];
	if (start) conds.push(gte(crmLeads.createdAt, start));

	const rows = await db
		.select({ ownerId: crmLeads.ownerId, n: count() })
		.from(crmLeads)
		.where(and(...conds))
		.groupBy(crmLeads.ownerId);
	return toOwnerCountMap(rows);
}

/**
 * Compose all six queries into one row per active AE. Reps absent from a metric map
 * default to 0 (never dropped from the output).
 *
 * `opts` (search + page/pageSize) is passed straight through to `getActiveAeList` — only
 * the AE roster is searched/paginated. The six metric-aggregation maps are computed across
 * ALL owners regardless of page, so per-page rows just look up their own entries. Returns
 * `{ rows, total }` where `total` is the full filtered AE count (not the current page's).
 */
export async function getDashboardData(
	range: DashboardRange,
	opts?: { search?: string; page?: number; pageSize?: number }
): Promise<{ rows: AeDashboardRow[]; total: number }> {
	const [{ aes, total }, owned, stages, wonAll, wonRange, adherence, addedRange, revenueRange] =
		await Promise.all([
			getActiveAeList(opts),
			getLeadsOwnedPerAe(),
			getStageDistributionInRangePerAe(range),
			getWonAllTimePerAe(),
			getWonInRangePerAe(range),
			getFollowUpAdherencePerAe(range),
			getLeadsAddedInRangePerAe(range),
			getRevenuePerAe(range)
		]);

	const rows = aes.map((ae) => ({
		id: ae.id,
		name: ae.name,
		leadsOwned: owned.get(ae.id) ?? 0,
		stageDistribution: stages.get(ae.id) ?? {},
		wonAllTime: wonAll.get(ae.id) ?? 0,
		wonInRange: wonRange.get(ae.id) ?? 0,
		adherencePct: adherence.get(ae.id) ?? 0,
		leadsAddedInRange: addedRange.get(ae.id) ?? 0,
		revenueCentsInRange: revenueRange.get(ae.id) ?? 0
	}));

	return { rows, total };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOwnerCountMap(rows: { ownerId: string | null; n: number }[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const r of rows) {
		if (!r.ownerId) continue;
		map.set(r.ownerId, Number(r.n));
	}
	return map;
}

/**
 * Normalize a `db.execute()` result across both configured drivers: postgres-js
 * returns a row array directly; neon-serverless returns `{ rows }`.
 */
function normalizeRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
		return (result as { rows: T[] }).rows;
	}
	return [];
}
