import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimLead } from '$lib/server/db/leads';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await claimLead(params.id, locals.user.id);
	if (!lead) throw error(404, 'Lead not found or already claimed');

	return json(lead);
};
