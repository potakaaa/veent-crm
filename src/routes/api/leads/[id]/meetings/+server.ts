import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listMeetingsForLead } from '$lib/server/db/meetings';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json(await listMeetingsForLead(params.id));
};
