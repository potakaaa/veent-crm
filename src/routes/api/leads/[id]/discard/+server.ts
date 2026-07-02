import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmLeadHistory } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { isManagerRole } from '$lib/utils/permissions';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const user = locals.user;

	const now = new Date();

	const result = await db.transaction(async (tx) => {
		const [lead] = await tx
			.select({ id: crmLeads.id, ownerId: crmLeads.ownerId })
			.from(crmLeads)
			.where(and(eq(crmLeads.id, params.id), isNull(crmLeads.deletedAt)))
			.limit(1)
			.for('update');

		if (!lead) return null;

		if (!isManagerRole(user.role) && lead.ownerId !== user.id) return 'forbidden' as const;

		const [row] = await tx
			.update(crmLeads)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(crmLeads.id, params.id), isNull(crmLeads.deletedAt)))
			.returning({ id: crmLeads.id });

		if (!row) return null;

		await tx.insert(crmLeadHistory).values({
			leadId: params.id,
			actorUserId: user.id,
			field: 'discarded',
			oldValue: null,
			newValue: 'true'
		});

		return row;
	});

	if (result === null) throw error(404, 'Lead not found or already discarded');
	if (result === 'forbidden') throw error(403, 'Forbidden');

	return json({ id: result.id });
};
