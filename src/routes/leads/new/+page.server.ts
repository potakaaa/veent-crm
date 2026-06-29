import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeads } from '$lib/server/db/leads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const leads = await listLeads();
	return { leads };
};
