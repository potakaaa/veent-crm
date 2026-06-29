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

export const actions: Actions = {
	resolve: async ({ request }) => {
		const data = await request.formData();
		const leadId = data.get('leadId');
		if (typeof leadId !== 'string' || !leadId) return fail(400, { error: 'Missing leadId' });

		await db
			.update(crmLeads)
			.set({ needsReview: false, updatedAt: new Date() })
			.where(eq(crmLeads.id, leadId));

		redirect(303, '/review');
	}
};
