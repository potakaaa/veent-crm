import type { PageServerLoad } from './$types';
import { listUnassignedLeads, listUsers } from '$lib/server/db/leads';

export const load: PageServerLoad = async () => {
	const [leads, users] = await Promise.all([listUnassignedLeads(), listUsers()]);
	return { leads, users };
};
