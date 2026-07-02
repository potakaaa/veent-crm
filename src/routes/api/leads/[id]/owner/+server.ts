import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { ownerUpdateSchema } from '$lib/zod/schemas';
import { reassignLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { isManagerRole } from '$lib/utils/permissions';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Authorization: only managers may reassign leads.
	if (!isManagerRole(locals.user.role)) throw error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = ownerUpdateSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const { ownerId } = parsed.data;

	// Verify the owner exists and is active — inactive reps cannot receive new leads.
	const [owner] = await db
		.select({ id: crmUsers.id })
		.from(crmUsers)
		.where(and(eq(crmUsers.id, ownerId), eq(crmUsers.active, true)))
		.limit(1);
	if (!owner) throw error(422, 'Owner not found or inactive');

	const lead = await reassignLead(params.id, ownerId, locals.user.id);
	if (!lead) throw error(404, 'Lead not found');

	return json(lead);
};
