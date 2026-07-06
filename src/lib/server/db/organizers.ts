/**
 * Server-side DB access for organizers (GitHub #189, #190).
 * Mirrors the leads.ts/meetings.ts convention: all reads are live-DB, visibility-scoped
 * where the SPEC requires it. Reuses leads.ts helpers (visibilityCondition, dbRowToLead,
 * enrichWithOwnerNames) rather than duplicating query logic.
 */
import { db } from './index';
import { crmOrganizers, crmLeads } from './schema';
import type { CrmOrganizer } from './schema';
import { eq, and, or, isNull, isNotNull, ilike, count, asc, desc, sql } from 'drizzle-orm';
import { visibilityCondition, dbRowToLead, enrichWithOwnerNames } from './leads';
import { normalizeCountry, parseCountryFromLocation } from '$lib/server/import-utils';
import type { Lead, Role } from '$lib/types';

export interface OrganizerWithCount {
	id: string;
	name: string;
	normalizedHandle: string | null;
	location: string | null;
	leadCount: number;
}

/**
 * Every organizer with its count of non-deleted linked leads. Plain unpaginated list
 * (SPEC: no pagination/search/sort), ordered by name. LEFT JOIN so zero-lead organizers
 * still appear with leadCount 0. GROUP BY the organizer PK — Postgres resolves the other
 * selected organizer columns via functional dependency on the primary key.
 */
export async function listOrganizersWithLeadCount(): Promise<OrganizerWithCount[]> {
	return db
		.select({
			id: crmOrganizers.id,
			name: crmOrganizers.name,
			normalizedHandle: crmOrganizers.normalizedHandle,
			location: crmOrganizers.location,
			leadCount: count(crmLeads.id)
		})
		.from(crmOrganizers)
		.leftJoin(crmLeads, and(eq(crmLeads.organizerId, crmOrganizers.id), isNull(crmLeads.deletedAt)))
		.groupBy(crmOrganizers.id)
		.orderBy(asc(crmOrganizers.name));
}

// Sort allowlist for the /organizers list (mirrors LEADS_SORT_COLS_SET). Only these two
// column ids are honored; any other/absent value falls back to 'name'.
export const ORGANIZERS_SORT_COLS = ['name', 'leads'] as const;
export type OrganizersSortCol = (typeof ORGANIZERS_SORT_COLS)[number];

// Derive a clean country name from an organizer's free-text location (e.g.
// "Makati, Philippines" → "Philippines"). Uses the same parse+normalize pair the ingest
// path uses, so the organizer country filter matches the leads country vocabulary exactly.
function deriveOrganizerCountry(location: string | null): string | null {
	return normalizeCountry(parseCountryFromLocation(location));
}

/**
 * Distinct, cleanly-normalized organizer countries (derived from the free-text location
 * column), alphabetically sorted. Powers the /organizers country filter dropdown. Computed
 * over ALL organizers, unaffected by list filters (mirrors getLeadCountries()'s shape).
 */
export async function getOrganizerCountries(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ location: crmOrganizers.location })
		.from(crmOrganizers)
		.where(isNotNull(crmOrganizers.location));
	const set = new Set<string>();
	for (const r of rows) {
		const c = deriveOrganizerCountry(r.location);
		if (c) set.add(c);
	}
	return [...set].sort();
}

/**
 * Filtered/sorted/paginated organizer list for /organizers (additive — does NOT replace
 * listOrganizersWithLeadCount, which has an external consumer). SQL handles name/handle
 * ilike search and name/leads-count sort; the country filter (derived from free-text
 * location) and final pagination run in JS AFTER the SQL-filtered/sorted set is fetched,
 * so `total` reflects the post-country-filter count — not the raw SQL row count.
 */
export async function listOrganizersFiltered(params: {
	search?: string;
	country?: string;
	sort?: string;
	dir?: 'asc' | 'desc';
	page?: number;
	pageSize?: number;
}): Promise<{ organizers: OrganizerWithCount[]; total: number }> {
	const { search, country, sort, dir = 'asc', page = 1, pageSize = 10 } = params;

	const conditions = [];
	if (search) {
		const like = `%${search}%`;
		conditions.push(
			or(ilike(crmOrganizers.name, like), ilike(crmOrganizers.normalizedHandle, like))
		);
	}

	const sortCol: OrganizersSortCol = ORGANIZERS_SORT_COLS.includes(sort as OrganizersSortCol)
		? (sort as OrganizersSortCol)
		: 'name';

	const orderBy =
		sortCol === 'leads'
			? dir === 'asc'
				? sql`count(${crmLeads.id}) asc`
				: sql`count(${crmLeads.id}) desc`
			: dir === 'asc'
				? asc(crmOrganizers.name)
				: desc(crmOrganizers.name);

	const rows = await db
		.select({
			id: crmOrganizers.id,
			name: crmOrganizers.name,
			normalizedHandle: crmOrganizers.normalizedHandle,
			location: crmOrganizers.location,
			leadCount: count(crmLeads.id)
		})
		.from(crmOrganizers)
		.leftJoin(crmLeads, and(eq(crmLeads.organizerId, crmOrganizers.id), isNull(crmLeads.deletedAt)))
		.where(conditions.length ? and(...conditions) : undefined)
		.groupBy(crmOrganizers.id)
		.orderBy(orderBy);

	const filtered = country
		? rows.filter((r) => deriveOrganizerCountry(r.location) === country)
		: rows;
	const total = filtered.length;
	const start = (page - 1) * pageSize;
	const organizers = filtered.slice(start, start + pageSize);
	return { organizers, total };
}

/**
 * Single organizer by id, or `null` when not found. Organizers have no soft-delete column,
 * so there is no deletedAt filter.
 */
export async function getOrganizer(id: string): Promise<CrmOrganizer | null> {
	const [row] = await db.select().from(crmOrganizers).where(eq(crmOrganizers.id, id)).limit(1);
	return row ?? null;
}

/**
 * Full event history for an organizer: every linked lead in EVERY stage (no implicit stage
 * filter — SPEC AC4), non-deleted, visibility-scoped via the shared visibilityCondition()
 * (SPEC AC6 — reused, not duplicated). Event-history fields (eventName/eventDate/stage/owner)
 * come from crm_leads only, never crm_meetings (SPEC AC5). Enriched with owner names so the
 * detail table can render the owner column. Ordered most-recent-event first.
 */
// Sort allowlist for the /organizers/[id] event-history table (mirrors ORGANIZERS_SORT_COLS).
export const DETAIL_SORT_COLS = ['event', 'eventDate'] as const;
export type DetailSortCol = (typeof DETAIL_SORT_COLS)[number];

export interface OrganizerLeadsOpts {
	search?: string;
	country?: string;
	owner?: string;
	stage?: string;
	sort?: string;
	dir?: 'asc' | 'desc';
	page?: number;
	pageSize?: number;
}

export interface OrganizerLeadsResult {
	leads: Lead[];
	total: number;
	countries: string[];
	owners: { id: string; name: string }[];
}

export async function listLinkedLeadsForOrganizer(
	organizerId: string,
	userId: string,
	role: Role
): Promise<Lead[]>;
export async function listLinkedLeadsForOrganizer(
	organizerId: string,
	userId: string,
	role: Role,
	opts: OrganizerLeadsOpts
): Promise<OrganizerLeadsResult>;
export async function listLinkedLeadsForOrganizer(
	organizerId: string,
	userId: string,
	role: Role,
	opts?: OrganizerLeadsOpts
): Promise<Lead[] | OrganizerLeadsResult> {
	// DB fetch is UNCHANGED from the 3-arg contract: full visibility-scoped, non-deleted
	// lead set for this organizer, enriched with owner names. Filters/sort/pagination (when
	// opts is supplied) are applied in JS below over this single per-request fetch.
	const rows = await db
		.select()
		.from(crmLeads)
		.where(
			and(
				eq(crmLeads.organizerId, organizerId),
				isNull(crmLeads.deletedAt),
				visibilityCondition(userId, role)
			)
		)
		.orderBy(sql`${crmLeads.eventDate} DESC NULLS LAST`);

	const all = await enrichWithOwnerNames(rows.map((row) => dbRowToLead(row)));

	// 3-arg call: preserve the original Lead[] return shape exactly.
	if (!opts) return all;

	// Dropdown option lists derived from the SAME unfiltered set (no separate query).
	const countrySet = new Set<string>();
	for (const l of all) if (l.country) countrySet.add(l.country);
	const countries = [...countrySet].sort();

	const ownerMap = new Map<string, string>();
	for (const l of all) if (l.ownerId) ownerMap.set(l.ownerId, l.ownerName ?? 'Unassigned');
	const owners = [...ownerMap]
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	const { search, country, owner, stage, sort, dir = 'asc', page = 1, pageSize = 10 } = opts;

	// Filters combine with AND, within the already visibility-scoped set.
	let filtered = all;
	if (search) {
		const q = search.toLowerCase();
		filtered = filtered.filter(
			(l) =>
				(l.eventName ?? '').toLowerCase().includes(q) ||
				(l.name ?? '').toLowerCase().includes(q) ||
				(l.handle ?? '').toLowerCase().includes(q)
		);
	}
	if (country) filtered = filtered.filter((l) => l.country === country);
	if (owner) filtered = filtered.filter((l) => l.ownerId === owner);
	if (stage) filtered = filtered.filter((l) => l.stage === stage);

	// Sort by event name or event date (allowlist-validated).
	const sortCol: DetailSortCol = DETAIL_SORT_COLS.includes(sort as DetailSortCol)
		? (sort as DetailSortCol)
		: 'eventDate';
	filtered = [...filtered].sort((a, b) => {
		const av =
			sortCol === 'event' ? (a.eventName ?? a.name ?? '').toLowerCase() : (a.eventDate ?? '');
		const bv =
			sortCol === 'event' ? (b.eventName ?? b.name ?? '').toLowerCase() : (b.eventDate ?? '');
		if (av < bv) return dir === 'asc' ? -1 : 1;
		if (av > bv) return dir === 'asc' ? 1 : -1;
		return 0;
	});

	const total = filtered.length;
	const start = (page - 1) * pageSize;
	const leads = filtered.slice(start, start + pageSize);
	return { leads, total, countries, owners };
}
