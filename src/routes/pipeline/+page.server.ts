import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listPipelineLeads, listUsers } from '$lib/server/db/leads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const [{ leads, lostCount }, users] = await Promise.all([listPipelineLeads(), listUsers()]);
	return { leads, lostCount, users };
};
