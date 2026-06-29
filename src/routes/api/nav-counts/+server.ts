import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNavCounts } from '$lib/server/db/leads';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const counts = await getNavCounts(locals.user.id);
	return json(counts);
};
