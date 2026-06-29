import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const report = await crm.getReports();
	return { report };
};
