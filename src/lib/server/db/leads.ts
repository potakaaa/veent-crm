/**
 * Server-side DB access for leads, users, and activities.
 * All public functions run queries; pure mapper helpers are exported for testing.
 */
import { db } from './index';
import {
	crmLeads,
	crmUsers,
	crmActivities,
	crmLeadHistory,
	crmLeadVisibilityGrants,
	crmOrganizers
} from './schema';
import {
	eq,
	isNull,
	isNotNull,
	desc,
	asc,
	and,
	or,
	ne,
	inArray,
	ilike,
	count,
	exists,
	sql,
	type SQL
} from 'drizzle-orm';
import type {
	Lead,
	User,
	Activity,
	Stage,
	Urgency,
	LostReason,
	MoveStagePayload,
	ActivityChannel,
	ActivityOutcome,
	Role,
	Visibility
} from '$lib/types';
import { computeAge } from '$lib/utils/dates';

type DbLead = typeof crmLeads.$inferSelect;
type DbUser = typeof crmUsers.$inferSelect;
type DbActivity = typeof crmActivities.$inferSelect;

// ---------------------------------------------------------------------------
// Pure mappers (exported for unit tests)
// ---------------------------------------------------------------------------

export function dbRowToLead(
	row: DbLead,
	followUpAt?: string | Date | null,
	organizerName?: string | null
): Lead {
	const createdAt = row.createdAt.toISOString();
	const lastActivityAt = row.lastActivityAt?.toISOString() ?? createdAt;

	const followUpIso = followUpAt
		? followUpAt instanceof Date
			? followUpAt.toISOString()
			: followUpAt
		: undefined;

	const handle = row.normalizedHandle
		? row.normalizedHandle.startsWith('@')
			? row.normalizedHandle
			: `@${row.normalizedHandle}`
		: '@' +
			row.name
				.toLowerCase()
				.replace(/\s+/g, '')
				.replace(/[^a-z0-9@]/g, '');

	const age = computeAge({ lastActivityAt, stage: row.stage as Stage, followUpAt: followUpIso });

	const urgency: Urgency = (() => {
		if (age.type === 'overdue') return 'overdue';
		if (age.type === 'due') return 'due';
		if (row.stage === 'replied') return 'replied';
		if (age.type === 'stale') return 'cold';
		if (age.type === 'fresh') return 'fresh';
		return 'normal';
	})();

	return {
		id: row.id,
		name: row.name,
		handle,
		category: row.category as Lead['category'],
		location: row.location ?? '—',
		country: row.country ?? '—',
		platform: (row.platform ?? 'Other') as Lead['platform'],
		stage: row.stage as Stage,
		ownerId: row.ownerId,
		visibility: row.visibility as Visibility,
		eventName: row.eventName ?? undefined,
		eventDate: row.eventDate ?? undefined,
		eventLink: row.eventLink ?? undefined,
		firstAnnouncedDate: row.firstAnnouncedDate ?? undefined,
		firstReachedOutDate: row.firstReachedOutDate ?? undefined,
		email: row.contactEmail ?? undefined,
		phone: row.contactPhone ?? undefined,
		pageUrl: row.pageUrl ?? undefined,
		socialFacebook: row.socialFacebook ?? undefined,
		socialInstagram: row.socialInstagram ?? undefined,
		// Lead's linked recurring-organizer entity (crm_organizers, GitHub #188). `organizerId`
		// maps straight from the row column (always available); `organizerName` requires a
		// crm_organizers lookup and is only passed by detail-load paths (undefined otherwise).
		organizerId: row.organizerId ?? null,
		organizerName: organizerName ?? undefined,
		source: row.source as Lead['source'],
		notes: row.notes ?? undefined,
		signedOrg: row.wonOrgName ?? undefined,
		dealValue: row.dealValueCents != null ? row.dealValueCents / 100 : undefined,
		currency: ((row.currency as Lead['currency']) ?? 'PHP') || 'PHP',
		signedDate: row.signedAt?.toISOString(),
		onboardingNotes: row.onboardingNotes ?? undefined,
		contractUrl: row.contractUrl ?? undefined,
		onboardingStartDate: row.onboardingStartDate ?? undefined,
		goLiveDate: row.goLiveDate ?? undefined,
		feeStructure: (row.feeStructure as 'legacy' | 'new' | null) ?? undefined,
		transactionFeePct: row.transactionFeePct ?? undefined,
		convenienceFeePesos: row.convenienceFeePesos ?? undefined,
		serviceFeePct: row.serviceFeePct ?? undefined,
		serviceFeePerTicketPesos: row.serviceFeePerTicketPesos ?? undefined,
		bankChargesAbsorbed: row.bankChargesAbsorbed ?? undefined,
		hasFutureEvents: row.hasFutureEvents ?? false,
		lostReason: (row.lostReason as Lead['lostReason']) ?? undefined,
		createdAt,
		lastActivityAt,
		followUpAt: followUpIso,
		age,
		urgency
	};
}

export function dbUserToUser(row: DbUser): User {
	return {
		id: row.id,
		name: row.name,
		email: row.email ?? '',
		role: row.role as User['role'],
		active: row.active
	};
}

export function dbActivityToActivity(row: DbActivity): Activity {
	return {
		id: row.id,
		leadId: row.leadId,
		repId: row.repId ?? '',
		channel: row.channel as Activity['channel'],
		outcome: (row.outcome ?? 'sent') as Activity['outcome'],
		note: row.notes ?? undefined,
		createdAt: row.occurredAt.toISOString(),
		followUpAt: row.followUpAt?.toISOString()
	};
}

/**
 * Parse a comma-joined CSV filter value (e.g. `?country=US,PH`) into a string array,
 * stripping empty elements. The `.filter(Boolean)` is required: a trailing comma or an
 * empty param value would otherwise yield a stray `''` element that becomes an
 * `inArray(col, [''])` clause matching nothing while misrepresenting "no filter."
 * Each segment is trimmed, so a hand-edited or shared URL with stray spaces
 * (e.g. `?country=US, PH`) still resolves correctly.
 * Pure — unit-testable without a DB.
 */
export function parseFilterCsv(raw: string | null | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Resolve a follow-up timestamp for a logged touch (pure — unit-testable without a DB).
 * Precedence: explicit `followUpAt` > computed from `followUpInDays` > null.
 */
export function resolveFollowUpAt(
	occurredAt: Date,
	followUpInDays?: number,
	followUpAt?: Date | string
): Date | null {
	if (followUpAt != null) {
		return followUpAt instanceof Date ? followUpAt : new Date(followUpAt);
	}
	if (followUpInDays != null && Number.isFinite(followUpInDays)) {
		return new Date(occurredAt.getTime() + followUpInDays * 86_400_000);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Visibility scoping (GitHub #87)
// ---------------------------------------------------------------------------

/**
 * Single shared row-visibility predicate, pushed into every rep-facing read.
 *
 * Manager → a no-op TRUE (`sql`true``), so callers can push it unconditionally and the
 * manager override lives in exactly one place. A rep sees a lead only when ANY of:
 *   - they own it,
 *   - its visibility is `everyone`,
 *   - it is unowned ("up for grabs" — always visible per SPEC), or
 *   - they hold an explicit grant row (visibility = `selected`).
 *
 * A missed wiring on any read surface is a silent privacy leak, so this is the ONLY
 * place the rule is expressed — never duplicate it inline at a call site.
 */
export function visibilityCondition(userId: string, role: Role): SQL {
	// managers and super_managers bypass per-lead visibility (GitHub #73 AC#5).
	if (role === 'manager' || role === 'super_manager') return sql`true`;
	return or(
		eq(crmLeads.ownerId, userId),
		eq(crmLeads.visibility, 'everyone'),
		isNull(crmLeads.ownerId),
		exists(
			db
				.select({ one: sql`1` })
				.from(crmLeadVisibilityGrants)
				.where(
					and(
						eq(crmLeadVisibilityGrants.leadId, crmLeads.id),
						eq(crmLeadVisibilityGrants.userId, userId)
					)
				)
		)
	) as SQL;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listLeads(userId: string, role: Role): Promise<Lead[]> {
	const rows = await db
		.select()
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), visibilityCondition(userId, role)))
		.orderBy(
			// Leads with upcoming events float to the top, soonest first.
			// Leads with no future event fall back to last-activity order.
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
			desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`)
		);
	return rows.map((row) => dbRowToLead(row));
}

const PIPELINE_STAGES = ['new', 'contacted', 'replied', 'in_discussion', 'won'] as const;

// DO NOT wire visibilityCondition here (manager-only surface — E2, GitHub #87).
// Its sole caller is /team (+page.server.ts), which is manager-gated (error 403 for
// non-managers). No rep-facing route calls this, so scoping it would be dead code.
export async function listPipelineLeads(): Promise<{ leads: Lead[]; lostCount: number }> {
	const eventOrder = [
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
		desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`)
	];

	const [rows, [{ lostCount }]] = await Promise.all([
		db
			.select()
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), inArray(crmLeads.stage, [...PIPELINE_STAGES])))
			.orderBy(...eventOrder),
		db
			.select({ lostCount: count() })
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), sql`${crmLeads.stage} = 'lost'`))
	]);

	return { leads: rows.map((row) => dbRowToLead(row)), lostCount };
}

/**
 * Distinct non-null normalized lead countries, alphabetically sorted.
 * Powers the country filter dropdown on the leads page.
 */
export async function getLeadCountries(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ country: crmLeads.country })
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), isNotNull(crmLeads.country)))
		.orderBy(asc(crmLeads.country));
	return rows.map((r) => r.country as string);
}

const LEADS_SORT_COLS = ['name', 'event', 'stage', 'platform', 'lastActivity', 'appeal'] as const;
type LeadsSortCol = (typeof LEADS_SORT_COLS)[number];

/**
 * SQL-authoritative Lead Appeal Score expression — mirrors computeAppealScore()
 * (src/lib/appeal-score.ts) exactly, computed inline in the ORDER BY. NEVER persisted,
 * no stored column. Both source columns are `date`, so Postgres integer date-subtraction
 * matches the TS whole-day diff; CURRENT_DATE stands in for the `now` fallback when
 * first_reached_out_date is null. NULL score (missing event/announce date) sorts last.
 *
 * early-mover  = clamp(50 - ((COALESCE(reachedOut, CURRENT_DATE) - announced) / 30) * 50, 0, 50)
 * runway       = (event - CURRENT_DATE) <= 0 ? 0 : clamp(((event - CURRENT_DATE) / 60) * 50, 0, 50)
 * score        = round(early-mover + runway), or NULL when event OR announced is missing
 */
const appealScoreExpr = sql`
	CASE
		WHEN ${crmLeads.eventDate} IS NULL OR ${crmLeads.firstAnnouncedDate} IS NULL THEN NULL
		ELSE ROUND(
			GREATEST(0, LEAST(50,
				50 - ((COALESCE(${crmLeads.firstReachedOutDate}, CURRENT_DATE) - ${crmLeads.firstAnnouncedDate})::numeric / 30) * 50))
			+
			CASE WHEN (${crmLeads.eventDate} - CURRENT_DATE) <= 0 THEN 0
				ELSE GREATEST(0, LEAST(50, ((${crmLeads.eventDate} - CURRENT_DATE)::numeric / 60) * 50)) END
		)
	END`;

export interface ListLeadsParams {
	userId: string;
	role: Role;
	segment?: 'mine' | 'all' | 'unassigned' | 'lost';
	stage?: string;
	platform?: string;
	country?: string;
	ownerId?: string;
	staleOnly?: boolean;
	hasFutureEvents?: boolean;
	weeksAhead?: number | null;
	search?: string;
	date?: string;
	dateField?: 'event_date' | 'created_at';
	createdFrom?: string;
	page?: number;
	pageSize?: number;
	sort?: string;
	dir?: 'asc' | 'desc';
}

/**
 * Server-backed, SQL-level filtered + paginated lead listing.
 * Preserves the listLeads() invariants: sort by COALESCE(last_activity_at, created_at) DESC,
 * hide lost leads unless the 'lost' segment is active, exclude soft-deleted rows.
 */
export async function listLeadsFiltered(
	params: ListLeadsParams
): Promise<{ leads: Lead[]; total: number }> {
	const {
		userId,
		role,
		segment = 'mine',
		stage,
		platform,
		country,
		ownerId,
		staleOnly = false,
		hasFutureEvents = false,
		weeksAhead = 8,
		search,
		date,
		dateField,
		createdFrom,
		page = 1,
		pageSize = 25,
		sort,
		dir = 'desc'
	} = params;

	const offset = (Math.max(1, page) - 1) * pageSize;

	const conditions: SQL[] = [isNull(crmLeads.deletedAt) as SQL, visibilityCondition(userId, role)];

	// Segment
	if (segment === 'mine') conditions.push(eq(crmLeads.ownerId, userId));
	else if (segment === 'unassigned') conditions.push(isNull(crmLeads.ownerId) as SQL);
	else if (segment === 'lost') conditions.push(sql`${crmLeads.stage} = 'lost'`);

	// Product rule: hide lost unless explicitly in the lost segment
	if (segment !== 'lost') conditions.push(sql`${crmLeads.stage} <> 'lost'`);

	// Stage filter
	if (stage) conditions.push(sql`${crmLeads.stage} = ${stage}`);

	// Platform filter
	if (platform) conditions.push(sql`${crmLeads.platform} = ${platform}`);

	// Country filter (normalized country column)
	if (country) conditions.push(eq(crmLeads.country, country));

	// Owner filter (GitHub #226) — manager/super_manager only; validated caller-side.
	if (ownerId) conditions.push(eq(crmLeads.ownerId, ownerId));

	// Stale only: no activity for > 30 days
	if (staleOnly) {
		conditions.push(
			sql`COALESCE(${crmLeads.lastActivityAt}, ${crmLeads.createdAt}) < NOW() - INTERVAL '30 days'`
		);
	}

	// Future-events flag filter (GitHub #94)
	if (hasFutureEvents) {
		conditions.push(eq(crmLeads.hasFutureEvents, true));
	}

	// Weeks-ahead minimum: show leads whose event is at least N weeks away.
	// Leads with no event date are always included. Past events are always excluded.
	// Skipped when a specific date is provided — the date filter already scopes results.
	if (!date && weeksAhead !== null && weeksAhead > 0) {
		conditions.push(
			sql`(
				${crmLeads.eventDate} IS NULL
				OR ${crmLeads.eventDate} >= CURRENT_DATE + make_interval(days => ${weeksAhead * 7})
			)`
		);
	}

	// Search: case-insensitive against name and normalizedHandle.
	// Ingest stores handles without '@' (e.g. 'acmefb'); manual creation stores with '@'.
	// Strip a leading '@' so "copied handle" queries match both storage formats.
	if (search) {
		const nameLike = `%${search}%`;
		const handleSearch = search.startsWith('@') ? search.slice(1) : search;
		const handleLike = `%${handleSearch}%`;
		conditions.push(
			or(
				ilike(crmLeads.name, nameLike),
				ilike(sql`COALESCE(${crmLeads.normalizedHandle}, '')`, handleLike)
			)!
		);
	}

	// Date filter (from calendar click-through)
	if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
		if (dateField === 'created_at') {
			conditions.push(sql`DATE(${crmLeads.createdAt}) = ${date}::date`);
		} else {
			conditions.push(sql`${crmLeads.eventDate} = ${date}::date`);
		}
	}

	// "Added since" filter (from dashboard drill-through) — independent of the exact-date
	// filter above; always scoped to created_at, lower-bound inclusive.
	if (createdFrom && /^\d{4}-\d{2}-\d{2}$/.test(createdFrom)) {
		conditions.push(sql`DATE(${crmLeads.createdAt}) >= ${createdFrom}::date`);
	}

	const where = and(...conditions);

	const LEADS_COL_MAP = {
		name: crmLeads.name,
		stage: crmLeads.stage,
		platform: crmLeads.platform
	} satisfies Record<Exclude<LeadsSortCol, 'event' | 'lastActivity' | 'appeal'>, unknown>;

	const validSort: LeadsSortCol =
		sort && (LEADS_SORT_COLS as readonly string[]).includes(sort)
			? (sort as LeadsSortCol)
			: 'event';
	const sortFn = dir === 'asc' ? asc : desc;

	let leadsOrder: SQL[];
	if (validSort === 'event') {
		leadsOrder =
			dir === 'asc'
				? [sql`${crmLeads.eventDate} ASC NULLS LAST`, asc(crmLeads.id)]
				: [sql`${crmLeads.eventDate} DESC NULLS LAST`, asc(crmLeads.id)];
	} else if (validSort === 'lastActivity') {
		leadsOrder = [
			sortFn(sql`COALESCE(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`),
			asc(crmLeads.id)
		];
	} else if (validSort === 'appeal') {
		leadsOrder =
			dir === 'asc'
				? [sql`${appealScoreExpr} ASC NULLS LAST`, asc(crmLeads.id)]
				: [sql`${appealScoreExpr} DESC NULLS LAST`, asc(crmLeads.id)];
	} else {
		leadsOrder = [sortFn(LEADS_COL_MAP[validSort]), asc(crmLeads.id)];
	}

	const [countResult, rows] = await Promise.all([
		db.select({ total: count() }).from(crmLeads).where(where),
		db
			.select()
			.from(crmLeads)
			.where(where)
			.orderBy(...leadsOrder)
			.limit(pageSize)
			.offset(offset)
	]);

	return {
		leads: rows.map((row) => dbRowToLead(row)),
		total: countResult[0].total
	};
}

/**
 * Single-record read, visibility-scoped (GitHub #87). A lead the caller may not see
 * returns `null` — the caller renders a 404, never a redacted view or a 403 (AC#8).
 */
export async function getLead(id: string, userId: string, role: Role): Promise<Lead | null> {
	// Left-join crm_organizers so the lead's linked organizer NAME is available for the
	// meeting-create pre-fill (GitHub #188). Selecting {lead, organizerName} keeps the
	// existing full-row shape intact for dbRowToLead; organizerName is passed separately.
	const [row] = await db
		.select({ lead: crmLeads, organizerName: crmOrganizers.name })
		.from(crmLeads)
		.leftJoin(crmOrganizers, eq(crmLeads.organizerId, crmOrganizers.id))
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt), visibilityCondition(userId, role)))
		.limit(1);
	return row ? dbRowToLead(row.lead, undefined, row.organizerName) : null;
}

const UNASSIGNED_SORT_COLS = ['name', 'event', 'stage', 'source', 'appeal'] as const;
type UnassignedSortCol = (typeof UNASSIGNED_SORT_COLS)[number];

const UNASSIGNED_COL_MAP = {
	name: crmLeads.name,
	stage: crmLeads.stage,
	source: crmLeads.source
} satisfies Record<Exclude<UnassignedSortCol, 'event' | 'appeal'>, unknown>;

/**
 * Base predicate for the Up for Grabs (unassigned) queue: unowned, not soft-deleted,
 * and not in a terminal (won/lost) stage. Shared so the country-options helper and the
 * list query stay in scope-parity — if this predicate changes, both callers change together.
 */
// NOTE (GitHub #87): the Up-for-Grabs surface is visibility-EXEMPT. Unowned leads are
// always visible to every rep (SPEC), so visibilityCondition is intentionally NOT applied
// to unassignedBaseConditions, listUnassignedLeads, or getUnassignedLeadCountries.
const unassignedBaseConditions = (): SQL[] => [
	isNull(crmLeads.ownerId) as SQL,
	isNull(crmLeads.deletedAt) as SQL,
	ne(crmLeads.stage, 'won'),
	ne(crmLeads.stage, 'lost')
];

/**
 * Distinct non-null countries among leads currently in the Up for Grabs queue.
 * Powers the Country filter on `/unassigned`. Scoped to the SAME predicate as
 * listUnassignedLeads() (unowned / active / non-deleted) — do NOT swap for
 * getLeadCountries(), which is unscoped and would offer countries for leads that
 * are not even in this queue.
 */
export async function getUnassignedLeadCountries(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ country: crmLeads.country })
		.from(crmLeads)
		.where(and(...unassignedBaseConditions(), isNotNull(crmLeads.country)))
		.orderBy(asc(crmLeads.country));
	return rows.map((r) => r.country as string);
}

export async function listUnassignedLeads(
	page = 1,
	pageSize = 25,
	sort?: string,
	dir?: 'asc' | 'desc',
	filters?: { country?: string[]; category?: string[]; weeksAhead?: number | null; search?: string }
): Promise<{ leads: Lead[]; total: number }> {
	const conditions = unassignedBaseConditions();

	// Multi-select filters: OR within a filter (inArray), AND across filters (separate conditions).
	// Empty/omitted array = no restriction (existing behavior preserved — backward compatible).
	if (filters?.country && filters.country.length > 0) {
		conditions.push(inArray(crmLeads.country, filters.country));
	}
	if (filters?.category && filters.category.length > 0) {
		conditions.push(inArray(crmLeads.category, filters.category as DbLead['category'][]));
	}

	// Weeks-ahead minimum: show only leads with events at least N weeks out.
	// undefined → default 8; null → no limit (All).
	const weeksAhead: number | null = filters?.weeksAhead !== undefined ? filters.weeksAhead : 8;
	if (weeksAhead !== null && weeksAhead > 0) {
		conditions.push(
			sql`(
				${crmLeads.eventDate} IS NULL
				OR ${crmLeads.eventDate} >= CURRENT_DATE + make_interval(days => ${weeksAhead * 7})
			)`
		);
	}

	// Search: case-insensitive against name, event name, and normalizedHandle.
	// Ingest stores handles without '@'; manual creation stores with '@'. Strip a
	// leading '@' so "copied handle" queries match both storage formats.
	const search = filters?.search?.trim();
	if (search) {
		// Escape LIKE metacharacters (\, %, _) so literal input never acts as a wildcard.
		const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');
		const nameLike = `%${escapeLike(search)}%`;
		const handleSearch = search.startsWith('@') ? search.slice(1) : search;
		const handleLike = `%${escapeLike(handleSearch)}%`;
		conditions.push(
			or(
				ilike(crmLeads.name, nameLike),
				ilike(sql`COALESCE(${crmLeads.normalizedHandle}, '')`, handleLike),
				ilike(sql`COALESCE(${crmLeads.eventName}, '')`, nameLike)
			)!
		);
	}

	const where = and(...conditions);

	const validSort: UnassignedSortCol | null =
		sort && (UNASSIGNED_SORT_COLS as readonly string[]).includes(sort)
			? (sort as UnassignedSortCol)
			: null;
	const sortFn = dir === 'asc' ? asc : desc;

	let order: SQL[];
	if (!validSort) {
		order = [
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
			desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`),
			asc(crmLeads.id)
		];
	} else if (validSort === 'event') {
		order =
			dir === 'asc'
				? [sql`${crmLeads.eventDate} ASC NULLS LAST`, asc(crmLeads.id)]
				: [sql`${crmLeads.eventDate} DESC NULLS LAST`, asc(crmLeads.id)];
	} else if (validSort === 'appeal') {
		order =
			dir === 'asc'
				? [sql`${appealScoreExpr} ASC NULLS LAST`, asc(crmLeads.id)]
				: [sql`${appealScoreExpr} DESC NULLS LAST`, asc(crmLeads.id)];
	} else {
		order = [sortFn(UNASSIGNED_COL_MAP[validSort]), asc(crmLeads.id)];
	}

	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(crmLeads)
			.where(where)
			.orderBy(...order)
			.limit(pageSize)
			.offset((Math.max(1, page) - 1) * pageSize),
		db.select({ total: count() }).from(crmLeads).where(where)
	]);

	return { leads: rows.map((row) => dbRowToLead(row)), total };
}

export async function claimLead(id: string, userId: string): Promise<Lead | null> {
	const now = new Date();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(crmLeads)
			// Owner change resets visibility to `everyone` (SPEC AC#13).
			.set({ ownerId: userId, visibility: 'everyone', updatedAt: now })
			.where(
				and(
					eq(crmLeads.id, id),
					isNull(crmLeads.deletedAt),
					isNull(crmLeads.ownerId),
					ne(crmLeads.stage, 'won'),
					ne(crmLeads.stage, 'lost')
				)
			)
			.returning();
		if (!row) return null;
		await tx.delete(crmLeadVisibilityGrants).where(eq(crmLeadVisibilityGrants.leadId, id));
		await tx.insert(crmLeadHistory).values({
			leadId: id,
			actorUserId: userId,
			field: 'owner_id',
			oldValue: null,
			newValue: userId
		});
		return dbRowToLead(row);
	});
}

export async function unclaimLead(id: string, userId: string): Promise<Lead | null> {
	const now = new Date();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(crmLeads)
			// Owner change (→ unowned) resets visibility to `everyone` (SPEC AC#13).
			.set({ ownerId: null, visibility: 'everyone', updatedAt: now })
			.where(
				and(
					eq(crmLeads.id, id),
					isNull(crmLeads.deletedAt),
					eq(crmLeads.ownerId, userId),
					ne(crmLeads.stage, 'won'),
					ne(crmLeads.stage, 'lost')
				)
			)
			.returning();
		if (!row) return null;
		await tx.delete(crmLeadVisibilityGrants).where(eq(crmLeadVisibilityGrants.leadId, id));
		await tx.insert(crmLeadHistory).values({
			leadId: id,
			actorUserId: userId,
			field: 'owner_id',
			oldValue: userId,
			newValue: null
		});
		return dbRowToLead(row);
	});
}

/**
 * User ids explicitly granted access to a `selected`-visibility lead. Non-null grantee
 * rows only (a user-delete nulls the fk). Used to pre-fill the detail-edit multi-select.
 */
export async function getLeadVisibilityGrants(leadId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: crmLeadVisibilityGrants.userId })
		.from(crmLeadVisibilityGrants)
		.where(
			and(eq(crmLeadVisibilityGrants.leadId, leadId), isNotNull(crmLeadVisibilityGrants.userId))
		);
	return rows.map((r) => r.userId as string);
}

export async function listUsers(): Promise<User[]> {
	const rows = await db.select().from(crmUsers).orderBy(crmUsers.name);
	return rows.map(dbUserToUser);
}

/**
 * Active reps only — the source for the manager-facing rep-filter dropdown on the
 * "All Follow-Ups" tab. Scoped to `role = 'rep' AND active = true` (deliberately does NOT
 * return managers/super_managers or deactivated users). Only ever consumed server-side by a
 * manager/super_manager session; never exposed to a rep.
 */
export async function listActiveReps(): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: crmUsers.id, name: crmUsers.name })
		.from(crmUsers)
		.where(and(eq(crmUsers.role, 'rep'), eq(crmUsers.active, true)))
		.orderBy(crmUsers.name);
}

export async function listActivities(leadId: string): Promise<Activity[]> {
	const rows = await db
		.select()
		.from(crmActivities)
		.where(eq(crmActivities.leadId, leadId))
		.orderBy(desc(crmActivities.occurredAt));
	return rows.map(dbActivityToActivity);
}

/**
 * Single-stage, paginated pipeline listing (10 per page by default).
 * Mirrors listPipelineLeads ordering: upcoming events float to the top,
 * then last-activity order. Returns the page rows plus the stage total.
 */
export async function listPipelineStage(
	stage: Stage,
	page: number = 1,
	limit: number = 10,
	userId: string,
	role: Role
): Promise<{ leads: Lead[]; total: number }> {
	const where = and(
		isNull(crmLeads.deletedAt),
		sql`${crmLeads.stage} = ${stage}`,
		visibilityCondition(userId, role)
	);
	const eventOrder = [
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
		desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`),
		asc(crmLeads.id)
	];
	const offset = (Math.max(1, page) - 1) * limit;
	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(crmLeads)
			.where(where)
			.orderBy(...eventOrder)
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(crmLeads).where(where)
	]);
	return { leads: rows.map((row) => dbRowToLead(row)), total };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createLead(
	input: {
		name: string;
		category: DbLead['category'];
		platform?: DbLead['platform'];
		location?: string;
		pageUrl?: string;
		contactEmail?: string;
		eventName?: string;
		eventLink?: string;
		eventDateRaw?: string;
		firstAnnouncedDate?: string;
		firstReachedOutDate?: string;
		notes?: string;
		visibility?: Visibility;
		selectedUserIds?: string[];
		organizerId?: string;
	},
	ownerId: string
): Promise<Lead> {
	const normalizedHandle =
		'@' +
		input.name
			.toLowerCase()
			.replace(/\s+/g, '')
			.replace(/[^a-z0-9@]/g, '');

	const visibility: Visibility = input.visibility ?? 'everyone';
	// Only persist grants for the `selected` scope; ignore any strays for other scopes.
	const grantIds = visibility === 'selected' ? (input.selectedUserIds ?? []) : [];

	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(crmLeads)
			.values({
				name: input.name,
				category: input.category,
				platform: input.platform ?? null,
				location: input.location ?? null,
				pageUrl: input.pageUrl ?? null,
				contactEmail: input.contactEmail ?? null,
				eventName: input.eventName ?? null,
				eventLink: input.eventLink ?? null,
				eventDateRaw: input.eventDateRaw ?? null,
				firstAnnouncedDate: input.firstAnnouncedDate ?? null,
				firstReachedOutDate: input.firstReachedOutDate ?? null,
				notes: input.notes ?? null,
				normalizedHandle,
				organizerId: input.organizerId ?? null,
				ownerId,
				visibility,
				source: 'manual',
				stage: 'new'
			})
			.returning();

		if (grantIds.length > 0) {
			await tx
				.insert(crmLeadVisibilityGrants)
				.values(grantIds.map((userId) => ({ leadId: row.id, userId })))
				.onConflictDoNothing();
		}

		return dbRowToLead(row);
	});
}

export async function updateLead(
	id: string,
	input: {
		name: string;
		category: DbLead['category'];
		platform?: DbLead['platform'];
		location?: string;
		pageUrl?: string;
		contactEmail?: string;
		contactPhone?: string;
		socialFacebook?: string;
		socialInstagram?: string;
		eventName?: string;
		eventDate?: string;
		eventDateRaw?: string;
		eventLink?: string;
		firstAnnouncedDate?: string | null;
		firstReachedOutDate?: string | null;
		notes?: string;
		visibility?: Visibility;
		selectedUserIds?: string[];
		onboardingNotes?: string | null;
		contractUrl?: string | null;
		onboardingStartDate?: string | null;
		goLiveDate?: string | null;
		feeStructure?: 'legacy' | 'new' | null;
		transactionFeePct?: number;
		convenienceFeePesos?: number;
		serviceFeePct?: number;
		serviceFeePerTicketPesos?: number;
		bankChargesAbsorbed?: boolean;
		hasFutureEvents?: boolean;
	},
	actorId: string
): Promise<Lead | null> {
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1);

		if (!existing) return null;

		const normalizedHandle =
			'@' +
			input.name
				.toLowerCase()
				.replace(/\s+/g, '')
				.replace(/[^a-z0-9@]/g, '');

		const now = new Date();
		const newVisibility: Visibility = input.visibility ?? (existing.visibility as Visibility);
		const [updated] = await tx
			.update(crmLeads)
			.set({
				name: input.name,
				normalizedHandle,
				category: input.category,
				platform: input.platform ?? null,
				location: input.location ?? null,
				pageUrl: input.pageUrl ?? null,
				contactEmail: input.contactEmail ?? null,
				contactPhone: input.contactPhone ?? null,
				socialFacebook: input.socialFacebook ?? null,
				socialInstagram: input.socialInstagram ?? null,
				eventName: input.eventName ?? null,
				eventDate: input.eventDate ?? null,
				eventDateRaw: input.eventDateRaw ?? null,
				eventLink: input.eventLink ?? null,
				firstAnnouncedDate: input.firstAnnouncedDate ?? null,
				firstReachedOutDate: input.firstReachedOutDate ?? null,
				notes: input.notes ?? null,
				visibility: newVisibility,
				// Onboarding fields: only overwrite when the key is present in the payload,
				// so a normal lead edit never wipes onboarding data (and vice versa).
				...(input.onboardingNotes !== undefined
					? { onboardingNotes: input.onboardingNotes || null }
					: {}),
				...(input.contractUrl !== undefined ? { contractUrl: input.contractUrl || null } : {}),
				...(input.onboardingStartDate !== undefined
					? { onboardingStartDate: input.onboardingStartDate || null }
					: {}),
				...(input.goLiveDate !== undefined ? { goLiveDate: input.goLiveDate || null } : {}),
				...(input.feeStructure !== undefined ? { feeStructure: input.feeStructure || null } : {}),
				...(input.transactionFeePct !== undefined
					? { transactionFeePct: input.transactionFeePct }
					: {}),
				...(input.convenienceFeePesos !== undefined
					? { convenienceFeePesos: input.convenienceFeePesos }
					: {}),
				...(input.serviceFeePct !== undefined ? { serviceFeePct: input.serviceFeePct } : {}),
				...(input.serviceFeePerTicketPesos !== undefined
					? { serviceFeePerTicketPesos: input.serviceFeePerTicketPesos }
					: {}),
				...(input.bankChargesAbsorbed !== undefined
					? { bankChargesAbsorbed: input.bankChargesAbsorbed }
					: {}),
				...(input.hasFutureEvents !== undefined ? { hasFutureEvents: input.hasFutureEvents } : {}),
				updatedAt: now
			})
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.returning();

		if (!updated) return null;

		// Write history rows for changed scalar fields.
		const tracked: Array<[string, string | null, string | null]> = [
			['name', existing.name, updated.name],
			['category', existing.category, updated.category],
			['platform', existing.platform ?? null, updated.platform ?? null],
			['location', existing.location ?? null, updated.location ?? null],
			['contact_email', existing.contactEmail ?? null, updated.contactEmail ?? null],
			['contact_phone', existing.contactPhone ?? null, updated.contactPhone ?? null],
			['page_url', existing.pageUrl ?? null, updated.pageUrl ?? null],
			['social_facebook', existing.socialFacebook ?? null, updated.socialFacebook ?? null],
			['social_instagram', existing.socialInstagram ?? null, updated.socialInstagram ?? null],
			['event_name', existing.eventName ?? null, updated.eventName ?? null],
			['event_date_raw', existing.eventDateRaw ?? null, updated.eventDateRaw ?? null],
			['event_link', existing.eventLink ?? null, updated.eventLink ?? null],
			[
				'first_announced_date',
				existing.firstAnnouncedDate ?? null,
				updated.firstAnnouncedDate ?? null
			],
			[
				'first_reached_out_date',
				existing.firstReachedOutDate ?? null,
				updated.firstReachedOutDate ?? null
			],
			['notes', existing.notes ?? null, updated.notes ?? null],
			['visibility', existing.visibility, updated.visibility],
			['onboarding_notes', existing.onboardingNotes ?? null, updated.onboardingNotes ?? null],
			['contract_url', existing.contractUrl ?? null, updated.contractUrl ?? null],
			[
				'onboarding_start_date',
				existing.onboardingStartDate ?? null,
				updated.onboardingStartDate ?? null
			],
			['go_live_date', existing.goLiveDate ?? null, updated.goLiveDate ?? null],
			['fee_structure', existing.feeStructure ?? null, updated.feeStructure ?? null],
			[
				'transaction_fee_pct',
				existing.transactionFeePct != null ? String(existing.transactionFeePct) : null,
				updated.transactionFeePct != null ? String(updated.transactionFeePct) : null
			],
			[
				'convenience_fee_pesos',
				existing.convenienceFeePesos != null ? String(existing.convenienceFeePesos) : null,
				updated.convenienceFeePesos != null ? String(updated.convenienceFeePesos) : null
			],
			[
				'service_fee_pct',
				existing.serviceFeePct != null ? String(existing.serviceFeePct) : null,
				updated.serviceFeePct != null ? String(updated.serviceFeePct) : null
			],
			[
				'service_fee_per_ticket_pesos',
				existing.serviceFeePerTicketPesos != null
					? String(existing.serviceFeePerTicketPesos)
					: null,
				updated.serviceFeePerTicketPesos != null ? String(updated.serviceFeePerTicketPesos) : null
			],
			[
				'bank_charges_absorbed',
				existing.bankChargesAbsorbed != null ? String(existing.bankChargesAbsorbed) : null,
				updated.bankChargesAbsorbed != null ? String(updated.bankChargesAbsorbed) : null
			],
			[
				'has_future_events',
				existing.hasFutureEvents != null ? String(existing.hasFutureEvents) : null,
				updated.hasFutureEvents != null ? String(updated.hasFutureEvents) : null
			]
		];

		const changed = tracked.filter(([, oldVal, newVal]) => oldVal !== newVal);
		if (changed.length > 0) {
			await tx.insert(crmLeadHistory).values(
				changed.map(([field, oldValue, newValue]) => ({
					leadId: id,
					actorUserId: actorId,
					field,
					oldValue,
					newValue
				}))
			);
		}

		// Grant reconciliation: always clear existing grants first, then re-insert when
		// `selected` so no stale grantee rows linger under a setting that no longer references them.
		await tx.delete(crmLeadVisibilityGrants).where(eq(crmLeadVisibilityGrants.leadId, id));
		if (newVisibility === 'selected') {
			const grantIds = input.selectedUserIds ?? [];
			if (grantIds.length > 0) {
				await tx
					.insert(crmLeadVisibilityGrants)
					.values(grantIds.map((userId) => ({ leadId: id, userId })))
					.onConflictDoNothing();
			}
		}

		return dbRowToLead(updated);
	});
}

/**
 * Insert an outreach touch and bump the lead's `last_activity_at`, transactionally.
 * Returns the created Activity, or `null` on a dedup conflict (caller maps to 409).
 * On a dedup no-op the lead is NOT updated.
 */
export async function insertActivity(input: {
	leadId: string;
	repId: string;
	channel: DbActivity['channel'];
	outcome?: DbActivity['outcome'];
	occurredAt?: Date;
	followUpInDays?: number;
	followUpAt?: Date;
	notes?: string;
}): Promise<Activity | null> {
	const ts = input.occurredAt ?? new Date();
	const followUpAt = resolveFollowUpAt(ts, input.followUpInDays, input.followUpAt);

	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(crmActivities)
			.values({
				leadId: input.leadId,
				repId: input.repId,
				channel: input.channel,
				outcome: input.outcome ?? null,
				occurredAt: ts,
				followUpAt,
				notes: input.notes ?? null
			})
			.onConflictDoNothing({
				target: [
					crmActivities.leadId,
					crmActivities.repId,
					crmActivities.occurredAt,
					crmActivities.channel
				]
			})
			.returning();

		// Dedup no-op: identical touch already recorded — do NOT touch the lead.
		if (inserted.length === 0) return null;

		await tx
			.update(crmLeads)
			.set({
				lastActivityAt: sql`GREATEST(COALESCE(${crmLeads.lastActivityAt}, ${ts}), ${ts})`,
				updatedAt: new Date()
			})
			.where(eq(crmLeads.id, input.leadId));

		return dbActivityToActivity(inserted[0]);
	});
}

export async function moveLeadStage(
	id: string,
	stage: Stage,
	payload: MoveStagePayload,
	actorId: string,
	actorRole: Role
): Promise<Lead | null | 'forbidden'> {
	const now = new Date();

	// SELECT, auth check, update, and history insert all run inside one transaction
	// so the authorization predicate is evaluated atomically with the mutation.
	const result = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({
				stage: crmLeads.stage,
				ownerId: crmLeads.ownerId,
				wonOrgName: crmLeads.wonOrgName,
				dealValueCents: crmLeads.dealValueCents,
				lostReason: crmLeads.lostReason
			})
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1);

		if (!existing) return null;

		// reps may only move their own leads; managers/super_managers move any.
		if (actorRole !== 'manager' && actorRole !== 'super_manager' && existing.ownerId !== actorId) {
			return 'forbidden' as const;
		}

		let rows: DbLead[];

		if (stage === 'won') {
			rows = await tx
				.update(crmLeads)
				.set({
					stage: 'won',
					wonOrgName: payload.wonOrgName ?? null,
					dealValueCents: payload.dealValueCents ?? null,
					currency: payload.currency ?? 'PHP',
					signedAt: payload.signedAt ? new Date(payload.signedAt) : now,
					lostReason: null, // clear stale lost metadata
					lastActivityAt: now,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		} else if (stage === 'lost') {
			rows = await tx
				.update(crmLeads)
				.set({
					stage: 'lost',
					lostReason: payload.lostReason as LostReason,
					wonOrgName: null, // clear stale won metadata
					dealValueCents: null,
					currency: null,
					signedAt: null,
					lastActivityAt: now,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		} else {
			rows = await tx
				.update(crmLeads)
				.set({
					stage,
					wonOrgName: null, // clear stale won/lost metadata when moving back to active
					dealValueCents: null,
					currency: null,
					signedAt: null,
					lostReason: null,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		}

		if (rows.length === 0) return null;

		const historyRows: (typeof crmLeadHistory.$inferInsert)[] = [
			{
				leadId: id,
				actorUserId: actorId,
				field: 'stage',
				oldValue: existing.stage,
				newValue: stage
			}
		];

		if (stage === 'won') {
			if (payload.wonOrgName !== undefined) {
				historyRows.push({
					leadId: id,
					actorUserId: actorId,
					field: 'won_org_name',
					oldValue: existing.wonOrgName,
					newValue: payload.wonOrgName ?? null
				});
			}
			if (payload.dealValueCents !== undefined) {
				historyRows.push({
					leadId: id,
					actorUserId: actorId,
					field: 'deal_value_cents',
					oldValue: existing.dealValueCents !== null ? String(existing.dealValueCents) : null,
					newValue: String(payload.dealValueCents)
				});
			}
		}

		if (stage === 'lost' && payload.lostReason !== undefined) {
			historyRows.push({
				leadId: id,
				actorUserId: actorId,
				field: 'lost_reason',
				oldValue: existing.lostReason ?? null,
				newValue: payload.lostReason
			});
		}

		await tx.insert(crmLeadHistory).values(historyRows);

		return rows[0];
	});

	if (result === null || result === undefined) return null;
	if (result === 'forbidden') return 'forbidden';
	return dbRowToLead(result);
}

export async function reassignLead(
	id: string,
	ownerId: string,
	actorId: string
): Promise<Lead | null> {
	const [existing] = await db
		.select({ ownerId: crmLeads.ownerId })
		.from(crmLeads)
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
		.limit(1);

	if (!existing) return null;

	const now = new Date();

	const updated = await db.transaction(async (tx) => {
		const rows = await tx
			.update(crmLeads)
			// Owner change resets visibility to `everyone` (SPEC AC#13).
			.set({ ownerId, visibility: 'everyone', updatedAt: now })
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.returning();

		if (rows.length === 0) return null;

		await tx.delete(crmLeadVisibilityGrants).where(eq(crmLeadVisibilityGrants.leadId, id));

		await tx.insert(crmLeadHistory).values({
			leadId: id,
			actorUserId: actorId,
			field: 'owner_id',
			oldValue: existing.ownerId,
			newValue: ownerId
		});

		return rows[0];
	});

	if (!updated) return null;
	return dbRowToLead(updated);
}

// ---------------------------------------------------------------------------
// Today queue — real DB read model for the Today page
// ---------------------------------------------------------------------------

/**
 * Returns all active (non-won/lost/deleted) leads owned by `userId`, with the
 * latest follow-up date from activities so urgency is computed correctly.
 * The caller (Today page) filters by urgency bucket.
 */
export async function getTodayQueue(userId: string, role: Role = 'rep'): Promise<Lead[]> {
	// Already owner-scoped (ownerId = userId), so visibilityCondition is defensive/no-op
	// here — every returned row is owned by the caller and thus always visible. Wired
	// anyway to keep all rep-facing read surfaces uniformly guarded (GitHub #87, E3).
	const rows = await db
		.select()
		.from(crmLeads)
		.where(
			and(
				isNull(crmLeads.deletedAt),
				eq(crmLeads.ownerId, userId),
				ne(crmLeads.stage, 'won'),
				ne(crmLeads.stage, 'lost'),
				visibilityCondition(userId, role)
			)
		)
		.orderBy(desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`));

	if (rows.length === 0) return [];

	// Batch-fetch the follow_up_at from each lead's most recent activity that has one scheduled.
	// DISTINCT ON (lead_id) ordered by occurred_at DESC picks the latest touch's follow-up,
	// so a rep's newest scheduling decision wins over older ones.
	const leadIds = rows.map((r) => r.id);
	const followUps = await db
		.selectDistinctOn([crmActivities.leadId], {
			leadId: crmActivities.leadId,
			followUpAt: crmActivities.followUpAt
		})
		.from(crmActivities)
		.where(and(inArray(crmActivities.leadId, leadIds), isNotNull(crmActivities.followUpAt)))
		.orderBy(crmActivities.leadId, desc(crmActivities.occurredAt));

	const followUpMap = new Map(followUps.map((f) => [f.leadId, f.followUpAt ?? null]));

	return rows.map((row) => dbRowToLead(row, followUpMap.get(row.id) ?? undefined));
}

// ---------------------------------------------------------------------------
// Follow-ups in a date range — calendar read model (owner-scoped)
// ---------------------------------------------------------------------------

/**
 * Lead-level predicate for the calendar follow-up query. Isolated as a pure,
 * DB-free helper so the AC3 regression guard can assert the `ownerId` scoping
 * predicate is present WITHOUT a live DB connection (see Validate Contract E1).
 *
 * MUST keep `eq(crmLeads.ownerId, userId)` — dropping it would leak other reps'
 * follow-ups onto the signed-in user's calendar (the single flagged regression risk).
 */
export function buildFollowUpsRangeLeadConditions(userId: string): SQL[] {
	return [
		isNull(crmLeads.deletedAt) as SQL,
		eq(crmLeads.ownerId, userId),
		ne(crmLeads.stage, 'won'),
		ne(crmLeads.stage, 'lost')
	];
}

/**
 * Pure inclusive range check (DB-free — unit-testable). A follow-up timestamp
 * falls in the visible calendar window when rangeStart <= value <= rangeEnd.
 */
export function isWithinRange(
	value: Date | string | null | undefined,
	rangeStart: Date,
	rangeEnd: Date
): boolean {
	if (!value) return false;
	const t = (value instanceof Date ? value : new Date(value)).getTime();
	if (Number.isNaN(t)) return false;
	return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
}

/**
 * Returns the signed-in user's own leads whose CURRENT follow-up falls within
 * [rangeStart, rangeEnd] — the read model for follow-up entries on the calendar.
 *
 * Adapts getTodayQueue's DISTINCT ON "current follow-up per lead" pattern: the
 * latest touch's follow-up wins per lead, then leads are filtered to those whose
 * current follow-up lands in the visible window. Owner scoping is preserved via
 * buildFollowUpsRangeLeadConditions (AC3). Does NOT modify getTodayQueue/getRemindersQueue.
 */
export async function getFollowUpsInRange(
	userId: string,
	rangeStart: Date,
	rangeEnd: Date
): Promise<Lead[]> {
	const rows = await db
		.select()
		.from(crmLeads)
		.where(and(...buildFollowUpsRangeLeadConditions(userId)))
		.orderBy(desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`));

	if (rows.length === 0) return [];

	const leadIds = rows.map((r) => r.id);
	const followUps = await db
		.selectDistinctOn([crmActivities.leadId], {
			leadId: crmActivities.leadId,
			followUpAt: crmActivities.followUpAt
		})
		.from(crmActivities)
		.where(and(inArray(crmActivities.leadId, leadIds), isNotNull(crmActivities.followUpAt)))
		.orderBy(crmActivities.leadId, desc(crmActivities.occurredAt));

	const followUpMap = new Map(followUps.map((f) => [f.leadId, f.followUpAt ?? null]));

	return rows
		.filter((row) => isWithinRange(followUpMap.get(row.id) ?? null, rangeStart, rangeEnd))
		.map((row) => dbRowToLead(row, followUpMap.get(row.id) ?? undefined));
}

// ---------------------------------------------------------------------------
// Calendar go-live milestones — live-stage leads shown on their goLiveDate
// ---------------------------------------------------------------------------

/**
 * Calendar-facing summary of a live-stage lead's go-live milestone. Carries only
 * the lead name (used directly as the calendar title — no derived `handle`) and a
 * local-midnight ISO string for day-safe grid bucketing.
 */
export type LiveLeadSummary = { id: string; name: string; goLiveIso: string };

/**
 * Normalize a Postgres DATE (`'YYYY-MM-DD'` string from Drizzle) to a local-midnight
 * ISO string by appending `T00:00:00`. Passing the bare `'YYYY-MM-DD'` to `new Date()`
 * parses as UTC-midnight, which shifts to the previous day in negative-offset zones and
 * mis-buckets the go-live milestone. Idempotent: input already containing `T` is returned
 * as-is.
 */
export function normalizeGoLiveDate(dateStr: string): string {
	return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
}

/**
 * Lead-level predicates for the calendar go-live query. Isolated as a pure, DB-free
 * helper so the AC1 selection guard can assert the WHERE clause via `.toSQL()` without
 * a live DB connection (mirrors buildFollowUpsRangeLeadConditions).
 */
export function buildGoLiveRangeConditions(): SQL[] {
	return [
		isNull(crmLeads.deletedAt) as SQL,
		eq(crmLeads.stage, 'live'),
		isNotNull(crmLeads.goLiveDate) as SQL
	];
}

/**
 * Returns live-stage leads whose `goLiveDate` falls within [rangeStart, rangeEnd] —
 * the read model for go-live milestone entries on the calendar. Team-wide, BUT the
 * enforced `visibilityCondition(userId, role)` predicate is applied so restricted
 * (`only_me` / `selected`) live leads never leak onto other users' calendars (concern C2).
 * Selects only `name` for the calendar title — never the derived `handle` (concern C1).
 */
export async function getGoLiveDatesInRange(
	rangeStart: Date,
	rangeEnd: Date,
	userId: string,
	role: Role
): Promise<LiveLeadSummary[]> {
	const rows = await db
		.select({
			id: crmLeads.id,
			name: crmLeads.name,
			goLiveDate: crmLeads.goLiveDate
		})
		.from(crmLeads)
		.where(and(...buildGoLiveRangeConditions(), visibilityCondition(userId, role)));

	return rows
		.map((row) => ({
			id: row.id,
			name: row.name,
			goLiveIso: normalizeGoLiveDate(row.goLiveDate!)
		}))
		.filter((summary) => isWithinRange(summary.goLiveIso, rangeStart, rangeEnd));
}

// ---------------------------------------------------------------------------
// Calendar event-start milestones — live-stage leads shown on their eventDate
// ---------------------------------------------------------------------------

/**
 * Calendar-facing summary of a live-stage lead's event-start milestone. Carries only
 * the lead name (used directly as the calendar title — no derived `handle`) and a
 * local-midnight ISO string for day-safe grid bucketing.
 */
export type EventStartSummary = { id: string; name: string; eventStartIso: string };

/**
 * Normalize a Postgres DATE (`'YYYY-MM-DD'` string from Drizzle) to a local-midnight
 * ISO string by appending `T00:00:00`. Passing the bare `'YYYY-MM-DD'` to `new Date()`
 * parses as UTC-midnight, which shifts to the previous day in negative-offset zones and
 * mis-buckets the event-start milestone. Idempotent: input already containing `T` is
 * returned as-is. Kept separate from normalizeGoLiveDate for independent unit-testability.
 */
export function normalizeEventDate(dateStr: string): string {
	return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
}

/**
 * Lead-level predicates for the calendar event-start query. Isolated as a pure, DB-free
 * helper so the AC1 selection guard can assert the WHERE clause via `.toSQL()` without
 * a live DB connection (mirrors buildGoLiveRangeConditions).
 */
export function buildEventStartRangeConditions(): SQL[] {
	return [
		isNull(crmLeads.deletedAt) as SQL,
		eq(crmLeads.stage, 'live'),
		isNotNull(crmLeads.eventDate) as SQL
	];
}

/**
 * Shared WHERE composition for the event-start calendar query. Exported so tests
 * can assert the exact SQL `getEventDatesInRange` produces without a live DB.
 */
export function buildEventStartWhereClause(userId: string, role: Role) {
	return and(...buildEventStartRangeConditions(), visibilityCondition(userId, role));
}

/**
 * Returns live-stage leads whose `eventDate` falls within [rangeStart, rangeEnd] —
 * the read model for event-start milestone entries on the calendar. Team-wide, BUT the
 * enforced `visibilityCondition(userId, role)` predicate is applied so restricted
 * (`only_me` / `selected`) live leads never leak onto other users' calendars (AC7).
 * Selects only `name` for the calendar title — never the derived `handle`.
 */
export async function getEventDatesInRange(
	rangeStart: Date,
	rangeEnd: Date,
	userId: string,
	role: Role
): Promise<EventStartSummary[]> {
	const rows = await db
		.select({
			id: crmLeads.id,
			name: crmLeads.name,
			eventDate: crmLeads.eventDate
		})
		.from(crmLeads)
		.where(buildEventStartWhereClause(userId, role));

	return rows
		.map((row) => ({
			id: row.id,
			name: row.name,
			eventStartIso: normalizeEventDate(row.eventDate!)
		}))
		.filter((summary) => isWithinRange(summary.eventStartIso, rangeStart, rangeEnd));
}

// ---------------------------------------------------------------------------
// Log touch — persist a real outreach activity
// ---------------------------------------------------------------------------

export async function logLeadTouch(
	id: string,
	input: {
		repId: string;
		channel: ActivityChannel;
		outcome: ActivityOutcome;
		followUpAt?: Date;
		notes?: string;
	}
): Promise<Lead | null> {
	const now = new Date();

	return db.transaction(async (tx) => {
		// Lock the row so a concurrent soft-delete can't sneak in between the existence
		// check and the subsequent activity/history inserts.
		const [existing] = await tx
			.select({ id: crmLeads.id, stage: crmLeads.stage })
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1)
			.for('update');

		if (!existing) return null;

		await tx.insert(crmActivities).values({
			leadId: id,
			repId: input.repId,
			channel: input.channel,
			outcome: input.outcome,
			followUpAt: input.followUpAt ?? null,
			notes: input.notes ?? null,
			occurredAt: now
		});

		// Auto-advance stage: contacted → replied when the outcome is 'replied'.
		const historyRows: (typeof crmLeadHistory.$inferInsert)[] = [];
		const newStage: Stage =
			input.outcome === 'replied' && existing.stage === 'contacted'
				? 'replied'
				: (existing.stage as Stage);

		if (newStage !== existing.stage) {
			historyRows.push({
				leadId: id,
				actorUserId: input.repId,
				field: 'stage',
				oldValue: existing.stage,
				newValue: newStage
			});
		}

		const [updated] = await tx
			.update(crmLeads)
			.set({
				lastActivityAt: now,
				...(newStage !== existing.stage ? { stage: newStage } : {}),
				updatedAt: now
			})
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.returning();

		if (historyRows.length > 0) {
			await tx.insert(crmLeadHistory).values(historyRows);
		}

		return updated ? dbRowToLead(updated, input.followUpAt) : null;
	});
}

// ---------------------------------------------------------------------------
// Nav counts — sidebar badge values (real DB, server-only)
// ---------------------------------------------------------------------------

export async function getNavCounts(
	userId: string,
	role: Role = 'rep'
): Promise<{ overdue: number; unassigned: number }> {
	// Overdue count flows through getTodayQueue (owner-scoped + visibility-guarded). The
	// unassigned sub-count is visibility-EXEMPT (unowned leads always visible — SPEC), so
	// visibilityCondition is intentionally NOT applied to it (E3).
	const [todayLeads, [unassignedRow]] = await Promise.all([
		getTodayQueue(userId, role),
		db
			.select({ count: sql<number>`COUNT(*)` })
			.from(crmLeads)
			.where(
				and(
					isNull(crmLeads.ownerId),
					isNull(crmLeads.deletedAt),
					ne(crmLeads.stage, 'won'),
					ne(crmLeads.stage, 'lost')
				)
			)
	]);

	return {
		overdue: todayLeads.filter((l) => l.urgency === 'overdue').length,
		unassigned: Number(unassignedRow?.count ?? 0)
	};
}

// ---------------------------------------------------------------------------
// Reminders queue — overdue + going-cold leads for the current user
// ---------------------------------------------------------------------------

/**
 * Returns two pre-sorted reminder buckets for `userId`:
 *   overdue — leads with a past follow-up date, earliest first (most overdue)
 *   cold    — active leads with no future follow-up that have gone stale (>30d),
 *             sorted by last-activity ascending (coldest first)
 *
 * Won, lost, soft-deleted, and unassigned leads are excluded.
 * Cold threshold mirrors computeAge: idle > 30 days without a booked follow-up.
 */
export async function getRemindersQueue(
	userId: string,
	role: Role = 'rep'
): Promise<{ overdue: Lead[]; due: Lead[]; upcoming: Lead[]; cold: Lead[] }> {
	const queue = await getTodayQueue(userId, role);

	// Shared comparator for buckets sorted by follow-up time then id.
	const byFollowUpAsc = (a: Lead, b: Lead) =>
		new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime() ||
		a.id.localeCompare(b.id);

	const overdue = queue.filter((l) => l.urgency === 'overdue').sort(byFollowUpAsc);

	const due = queue.filter((l) => l.urgency === 'due').sort(byFollowUpAsc);

	// Upcoming — future follow-up within the next 7 days.
	// Excludes `due` (already its own bucket) and `cold` (stale leads that happen to have
	// a future follow-up stay in the cold bucket, not upcoming, to avoid dual-bucket overlap).
	const now = new Date();
	const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000);
	const upcoming = queue
		.filter((l) => {
			if (!l.followUpAt) return false;
			if (l.urgency === 'due' || l.urgency === 'cold') return false;
			const t = new Date(l.followUpAt).getTime();
			return t > now.getTime() && t <= sevenDaysOut.getTime();
		})
		.sort(byFollowUpAsc);

	const cold = queue
		.filter((l) => l.urgency === 'cold')
		.sort(
			(a, b) =>
				new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime() ||
				a.id.localeCompare(b.id)
		);

	return { overdue, due, upcoming, cold };
}

// ---------------------------------------------------------------------------
// Owner-name enrichment — route-load-layer helper (REM-1)
// ---------------------------------------------------------------------------

/**
 * Populates `ownerName` on each lead ("Unassigned" when `ownerId` is null) via a single
 * batched `crmUsers` lookup over the distinct non-null owner ids in the input.
 *
 * Purely additive read-path enrichment — deliberately NOT folded into getTodayQueue/
 * getRemindersQueue (those stay untouched per the plan's hard constraint). Callers opt in at
 * the route-load layer. Returns new lead objects (does not mutate the inputs).
 */
export async function enrichWithOwnerNames(leads: Lead[]): Promise<Lead[]> {
	if (leads.length === 0) return leads;

	const ownerIds = [
		...new Set(leads.map((l) => l.ownerId).filter((id): id is string => id !== null))
	];

	if (ownerIds.length === 0) {
		return leads.map((l) => ({ ...l, ownerName: 'Unassigned' }));
	}

	const owners = await db
		.select({ id: crmUsers.id, name: crmUsers.name })
		.from(crmUsers)
		.where(inArray(crmUsers.id, ownerIds));

	const nameMap = new Map(owners.map((o) => [o.id, o.name]));

	return leads.map((l) => ({
		...l,
		ownerName: l.ownerId ? (nameMap.get(l.ownerId) ?? 'Unassigned') : 'Unassigned'
	}));
}

// ---------------------------------------------------------------------------
// All follow-ups queue — uncapped read model for the "All Follow-Ups" tab (REM-2)
// ---------------------------------------------------------------------------

/**
 * Every pending follow-up visible to the caller, uncapped (no 7-day window), sorted by
 * `followUpAt` ascending. Backs the "All Follow-Ups" tab on /reminders.
 *
 * Base scope is `visibilityCondition(userId, role)` ALONE — deliberately NOT ANDed with
 * `eq(crmLeads.ownerId, userId)`. This is the load-bearing difference from getTodayQueue/
 * getFollowUpsInRange (both single-owner-scoped by design): a manager must see the whole
 * team's follow-ups here, so the manager no-op TRUE from visibilityCondition is what makes
 * that work. `filterRepId` narrows ADDITIONALLY (never replacing the base scope) and is
 * honored ONLY for non-rep roles — a rep can never surface another rep's leads via this
 * path even if `filterRepId` were supplied.
 */
export async function getAllFollowUpsQueue(
	userId: string,
	role: Role = 'rep',
	opts?: { filterRepId?: string }
): Promise<Lead[]> {
	const conditions: SQL[] = [
		isNull(crmLeads.deletedAt) as SQL,
		ne(crmLeads.stage, 'won'),
		ne(crmLeads.stage, 'lost'),
		visibilityCondition(userId, role),
		// Push the "has a booked follow-up" filter into SQL so managers (visibilityCondition
		// = true) don't load every active lead in the company just to discard most of them
		// in JS below — only leads with at least one followUpAt-bearing activity qualify.
		exists(
			db
				.select({ one: sql`1` })
				.from(crmActivities)
				.where(and(eq(crmActivities.leadId, crmLeads.id), isNotNull(crmActivities.followUpAt)))
		) as SQL
	];

	// Additive rep narrowing — managers/super_managers only. Ignored for reps by design.
	if (opts?.filterRepId && role !== 'rep') {
		conditions.push(eq(crmLeads.ownerId, opts.filterRepId));
	}

	// No .orderBy here — the final `.sort()` below (by followUpAt) is what actually determines
	// the returned order, so an initial DB-level sort would just be discarded work.
	const rows = await db
		.select()
		.from(crmLeads)
		.where(and(...conditions));

	if (rows.length === 0) return [];

	const leadIds = rows.map((r) => r.id);
	const followUps = await db
		.selectDistinctOn([crmActivities.leadId], {
			leadId: crmActivities.leadId,
			followUpAt: crmActivities.followUpAt
		})
		.from(crmActivities)
		.where(and(inArray(crmActivities.leadId, leadIds), isNotNull(crmActivities.followUpAt)))
		.orderBy(crmActivities.leadId, desc(crmActivities.occurredAt));

	const followUpMap = new Map(followUps.map((f) => [f.leadId, f.followUpAt ?? null]));

	// Keep only leads that currently have a follow-up booked (any date — no window cap; this
	// is the key difference from getFollowUpsInRange's range filter), then sort soonest-first.
	return rows
		.filter((row) => followUpMap.get(row.id) != null)
		.map((row) => dbRowToLead(row, followUpMap.get(row.id) ?? undefined))
		.sort(
			(a, b) =>
				new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime() ||
				a.id.localeCompare(b.id)
		);
}

// ---------------------------------------------------------------------------
// Snooze — defer follow-up without counting as an outreach touch
// ---------------------------------------------------------------------------

export async function snoozeLead(
	id: string,
	repId: string,
	followUpAt: Date,
	notes?: string
): Promise<Lead | null> {
	return db.transaction(async (tx) => {
		// Lock the lead row so a concurrent soft-delete can't orphan the activity insert.
		const [existing] = await tx
			.select()
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1)
			.for('update');

		if (!existing) return null;

		// Snooze inserts a scheduling-only activity.  We do NOT update lastActivityAt
		// so the lead's staleness timer is not reset by a snooze.
		await tx.insert(crmActivities).values({
			leadId: id,
			repId,
			channel: 'other',
			outcome: 'other',
			followUpAt,
			notes: notes ?? 'Snoozed — deferred follow-up',
			occurredAt: new Date()
		});

		return dbRowToLead(existing, followUpAt);
	});
}

// ---------------------------------------------------------------------------
// Lead history (ownership + stage changes)
// ---------------------------------------------------------------------------

export async function getLeadHistory(leadId: string): Promise<
	Array<{
		id: string;
		field: string;
		actorUserId: string | null;
		oldValue: string | null;
		newValue: string | null;
		at: string;
	}>
> {
	const rows = await db
		.select({
			id: crmLeadHistory.id,
			field: crmLeadHistory.field,
			actorUserId: crmLeadHistory.actorUserId,
			oldValue: crmLeadHistory.oldValue,
			newValue: crmLeadHistory.newValue,
			at: crmLeadHistory.at
		})
		.from(crmLeadHistory)
		.where(
			and(eq(crmLeadHistory.leadId, leadId), inArray(crmLeadHistory.field, ['owner_id', 'stage']))
		)
		.orderBy(asc(crmLeadHistory.at));
	return rows.map((r) => ({
		id: r.id,
		field: r.field,
		actorUserId: r.actorUserId,
		oldValue: r.oldValue,
		newValue: r.newValue,
		at: r.at.toISOString()
	}));
}

// Heatmap aggregation
// ---------------------------------------------------------------------------

export async function getLeadHeatmapData(
	metric: 'event_date' | 'created_at'
): Promise<Array<{ date: string; stage: string; count: number }>> {
	const today = new Date();
	const todayStr = today.toISOString().split('T')[0];
	const aheadStr = new Date(+today + 380 * 86400_000).toISOString().split('T')[0]; // 53+ weeks

	if (metric === 'event_date') {
		return db
			.select({
				date: sql<string>`${crmLeads.eventDate}::text`,
				stage: crmLeads.stage,
				count: sql<number>`COUNT(*)::int`
			})
			.from(crmLeads)
			.where(
				and(
					isNull(crmLeads.deletedAt),
					isNotNull(crmLeads.eventDate),
					sql`${crmLeads.eventDate} >= ${todayStr}`,
					sql`${crmLeads.eventDate} <= ${aheadStr}`
				)
			)
			.groupBy(crmLeads.eventDate, crmLeads.stage);
	}

	// created_at: past 12 months — future rows don't exist so keep backward window
	const pastStr = new Date(+today - 365 * 86400_000).toISOString().split('T')[0];
	return db
		.select({
			date: sql<string>`DATE(${crmLeads.createdAt})::text`,
			stage: crmLeads.stage,
			count: sql<number>`COUNT(*)::int`
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), sql`${crmLeads.createdAt} >= ${pastStr}`))
		.groupBy(sql`DATE(${crmLeads.createdAt})`, crmLeads.stage);
}
