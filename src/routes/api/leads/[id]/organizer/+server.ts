import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { organizerTagSchema } from '$lib/zod/schemas';
import { db } from '$lib/server/db/index';
import { crmLeads, crmOrganizers, crmLeadHistory } from '$lib/server/db/schema';
import { getLead } from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';

// PATCH — tag/untag a lead to a recurring organizer (GitHub #188).
// 200 + updated lead / 400 invalid / 401 unauthed / 403 not editable by caller /
// 404 lead missing / 422 organizer missing.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid lead id');

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

	const existingLead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!existingLead) throw error(404, 'Lead not found');

	const me = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};
	if (!canEditLead(me, existingLead)) throw error(403, 'Forbidden');

	const existing = { organizerId: existingLead.organizerId };
	const actorUserId = locals.user.id;
	const updated = await db.transaction(async (tx) => {
		const [row] = await tx
			.update(crmLeads)
			.set({ organizerId, updatedAt: new Date() })
			.where(eq(crmLeads.id, params.id))
			.returning();
		if (!row) return null;

		// Audit trail — every organizer change writes a crm_lead_history row.
		await tx.insert(crmLeadHistory).values({
			leadId: params.id,
			actorUserId,
			field: 'organizer_id',
			oldValue: existing.organizerId ?? null,
			newValue: organizerId ?? null
		});

		return row;
	});
	if (!updated) throw error(404, 'Lead not found');

	return json(updated);
};
