import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	// Existing leads power the advisory dedup check while typing.
	const leads = await crm.listLeads({ segment: 'all', includeLost: true });
	return { leads };
};
