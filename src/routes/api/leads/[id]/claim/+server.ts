import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimLead, unclaimLead } from '$lib/server/db/leads';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid lead ID');

	const lead = await claimLead(params.id, locals.user.id);
	if (!lead) throw error(404, 'Lead not found or already claimed');

	return json(lead);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid lead ID');

	const lead = await unclaimLead(params.id, locals.user.id);
	if (!lead) throw error(404, 'Lead not found or not owned by you');

	return json(lead);
};
