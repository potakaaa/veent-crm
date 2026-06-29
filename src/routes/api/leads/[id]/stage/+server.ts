import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { moveStageSchema } from '$lib/zod/schemas';
import { getLead, moveLeadStage } from '$lib/server/db/leads';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = moveStageSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	// Authorization: managers can edit any lead; reps can only edit leads they own.
	const existing = await getLead(params.id);
	if (!existing) throw error(404, 'Lead not found');
	if (locals.user.role !== 'manager' && existing.ownerId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	const { stage, ...payload } = parsed.data;
	const lead = await moveLeadStage(params.id, stage, payload, locals.user.id);
	if (!lead) throw error(404, 'Lead not found');

	return json(lead);
};
