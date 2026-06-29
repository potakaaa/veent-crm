import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	const leads = await db
		.select({
			id: crmLeads.id,
			name: crmLeads.name,
			category: crmLeads.category,
			platform: crmLeads.platform,
			stage: crmLeads.stage,
			source: crmLeads.source,
			createdAt: crmLeads.createdAt
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true)))
		.orderBy(crmLeads.createdAt);

	return { leads };
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
			.where(and(eq(crmLeads.id, leadId), isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true)))
			.returning({ id: crmLeads.id });

		if (!updated) return fail(404, { error: 'Lead not found or already resolved' });

		redirect(303, '/review');
	}
};
