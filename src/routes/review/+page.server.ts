import type { Actions, PageServerLoad } from './$types';
import { listReviewLeads } from '$lib/server/db/leads';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const rawPage = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const sort = url.searchParams.get('sort') ?? 'createdAt';
	const dir = url.searchParams.get('dir') === 'desc' ? ('desc' as const) : ('asc' as const);

	const result = await listReviewLeads(rawPage, PAGE_SIZE, sort, dir);
	const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

	if (rawPage > totalPages) {
		redirect(307, totalPages > 1 ? `?page=${totalPages}` : '/review');
	}

	return {
		leads: result.leads,
		sort,
		dir,
		pagination: {
			page: rawPage,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages
		}
	};
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const actions: Actions = {
	resolve: async ({ request }) => {
		const data = await request.formData();
		const leadId = data.get('leadId');
		if (typeof leadId !== 'string' || !leadId) return fail(400, { error: 'Missing leadId' });
		if (!UUID_RE.test(leadId)) return fail(400, { error: 'Invalid leadId' });

		const rawPage = parseInt(data.get('page') as string, 10);
		const page = Number.isFinite(rawPage) && rawPage > 1 ? rawPage : 1;

		const [updated] = await db
			.update(crmLeads)
			.set({ needsReview: false, updatedAt: new Date() })
			.where(
				and(eq(crmLeads.id, leadId), isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true))
			)
			.returning({ id: crmLeads.id });

		if (!updated) return fail(404, { error: 'Lead not found or already resolved' });

		redirect(303, page > 1 ? `/review?page=${page}` : '/review');
	}
};
