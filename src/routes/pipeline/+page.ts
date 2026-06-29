import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const [leads, users] = await Promise.all([
		crm.listLeads({ segment: 'mine', includeLost: true }),
		crm.listUsers()
	]);
	return { leads, users };
};
