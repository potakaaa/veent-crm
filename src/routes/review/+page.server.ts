import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { eq, isNull, and, asc, desc, sql } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';

const SORT_COLS = [
	'name',
	'category',
	'platform',
	'stage',
	'source',
	'createdAt',
	'event'
] as const;
type SortCol = (typeof SORT_COLS)[number];

const COL_MAP = {
	name: crmLeads.name,
	category: crmLeads.category,
	platform: crmLeads.platform,
	stage: crmLeads.stage,
	source: crmLeads.source,
	createdAt: crmLeads.createdAt
} satisfies Record<Exclude<SortCol, 'event'>, unknown>;

function buildOrder(sort: SortCol, dir: 'asc' | 'desc') {
	if (sort === 'event') {
		// Upcoming events first (asc), no-date rows always last regardless of direction.
		return dir === 'asc'
			? [sql`${crmLeads.eventDate} ASC NULLS LAST`, asc(crmLeads.id)]
			: [sql`${crmLeads.eventDate} DESC NULLS LAST`, asc(crmLeads.id)];
	}
	const fn = dir === 'asc' ? asc : desc;
	return [fn(COL_MAP[sort]), asc(crmLeads.id)];
}

export const load: PageServerLoad = async ({ url }) => {
	const rawSort = url.searchParams.get('sort') ?? 'createdAt';
	const sort: SortCol = (SORT_COLS as readonly string[]).includes(rawSort)
		? (rawSort as SortCol)
		: 'createdAt';
	const dir = url.searchParams.get('dir') === 'desc' ? ('desc' as const) : ('asc' as const);

	const leads = await db
		.select({
			id: crmLeads.id,
			name: crmLeads.name,
			category: crmLeads.category,
			platform: crmLeads.platform,
			stage: crmLeads.stage,
			source: crmLeads.source,
			createdAt: crmLeads.createdAt,
			eventDate: crmLeads.eventDate,
			eventName: crmLeads.eventName
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true)))
		.orderBy(...buildOrder(sort, dir));

	return { leads, sort, dir };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const actions: Actions = {
	resolve: async ({ request }) => {
		const data = await request.formData();
		const leadId = data.get('leadId');
		if (typeof leadId !== 'string' || !leadId) return fail(400, { error: 'Missing leadId' });
		if (!UUID_RE.test(leadId)) return fail(400, { error: 'Invalid leadId' });

		const [updated] = await db
			.update(crmLeads)
			.set({ needsReview: false, updatedAt: new Date() })
			.where(
				and(eq(crmLeads.id, leadId), isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true))
			)
			.returning({ id: crmLeads.id });

		if (!updated) return fail(404, { error: 'Lead not found or already resolved' });

		redirect(303, '/review');
	}
};
