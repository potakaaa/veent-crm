import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const now = new Date();
	const [updated] = await db
		.update(crmLeads)
		.set({ deletedAt: now, updatedAt: now })
		.where(and(eq(crmLeads.id, params.id), isNull(crmLeads.deletedAt)))
		.returning({ id: crmLeads.id });

	if (!updated) throw error(404, 'Lead not found or already discarded');

	await db.insert(crmLeadHistory).values({
		leadId: params.id,
		actorUserId: locals.user.id,
		field: 'discarded',
		oldValue: null,
		newValue: 'true'
	});

	return json({ id: updated.id });
};
