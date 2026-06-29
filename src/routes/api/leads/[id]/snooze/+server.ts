import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { snoozeSchema } from '$lib/zod/schemas';
import { getLead, snoozeLead } from '$lib/server/db/leads';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id);
	if (!lead) throw error(404, 'Lead not found');
	if (locals.user.role !== 'manager' && lead.ownerId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = snoozeSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	// Parse YYYY-MM-DD as Asia/Manila midnight (UTC+8).
	const followUpAt = new Date(parsed.data.followUpAt + 'T00:00:00+08:00');

	const result = await snoozeLead(params.id, locals.user.id, followUpAt, parsed.data.notes);
	if (result === null) throw error(404, 'Lead not found');
	return json(result);
};
