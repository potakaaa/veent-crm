import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const [me, users, leads] = await Promise.all([
		crm.getCurrentUser(),
		crm.listUsers(),
		// Pull everything (incl. lost) once; the page filters client-side per segment.
		crm.listLeads({ segment: 'all', includeLost: true })
	]);
	return { me, users, leads };
};
