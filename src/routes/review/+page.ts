import type { PageLoad } from './$types';
import { crm } from '$lib/services';

export const load: PageLoad = async () => {
	const items = await crm.listReviewItems();
	return { items };
};
