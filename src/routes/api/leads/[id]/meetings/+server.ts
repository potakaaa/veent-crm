import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listMeetingsForLead } from '$lib/server/db/meetings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid lead ID');
	return json(await listMeetingsForLead(params.id));
};
