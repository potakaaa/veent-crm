import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const [me, leads] = await Promise.all([crm.getCurrentUser(), crm.listLeads({ segment: 'mine' })]);
	return { me, leads };
};
