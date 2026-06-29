import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const [leads, users] = await Promise.all([
		crm.listLeads({ segment: 'unassigned' }),
		crm.listUsers()
	]);
	return { leads, users };
};
