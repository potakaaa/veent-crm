import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { crm } from '$lib/services';

export const load: PageLoad = async ({ params }) => {
	const [lead, me, users] = await Promise.all([
		crm.getLead(params.id),
		crm.getCurrentUser(),
		crm.listUsers()
	]);
	if (!lead) throw error(404, 'Lead not found');
	const activities = await crm.listActivities(lead.id);
	return { lead, activities, me, users };
};
