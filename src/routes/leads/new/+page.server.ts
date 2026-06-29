import type { PageServerLoad } from './$types';
import { listLeads } from '$lib/server/db/leads';

export const load: PageServerLoad = async () => {
	const leads = await listLeads();
	return { leads };
};
