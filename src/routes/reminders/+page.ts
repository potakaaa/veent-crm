import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const leads = await crm.listLeads({ segment: 'mine' });
	return { leads };
};
