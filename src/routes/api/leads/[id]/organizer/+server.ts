import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { organizerTagSchema } from '$lib/zod/schemas';
import { db } from '$lib/server/db/index';
import { crmLeads, crmOrganizers, crmLeadHistory } from '$lib/server/db/schema';

// PATCH — tag/untag a lead to a recurring organizer (GitHub #188).
// 200 + updated lead / 400 invalid / 401 unauthed / 404 lead missing / 422 organizer missing.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = organizerTagSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const { organizerId } = parsed.data;

	// When tagging (non-null), verify the organizer exists.
	if (organizerId !== null) {
		const [org] = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(eq(crmOrganizers.id, organizerId))
			.limit(1);
		if (!org) throw error(422, 'Organizer not found');
	}

	const [existing] = await db
		.select({ organizerId: crmLeads.organizerId })
		.from(crmLeads)
		.where(eq(crmLeads.id, params.id))
		.limit(1);
	if (!existing) throw error(404, 'Lead not found');

	const [updated] = await db
		.update(crmLeads)
		.set({ organizerId, updatedAt: new Date() })
		.where(eq(crmLeads.id, params.id))
		.returning();
	if (!updated) throw error(404, 'Lead not found');

	// Audit trail — every organizer change writes a crm_lead_history row.
	await db.insert(crmLeadHistory).values({
		leadId: params.id,
		actorUserId: locals.user.id,
		field: 'organizer_id',
		oldValue: existing.organizerId ?? null,
		newValue: organizerId ?? null
	});

	return json(updated);
};
