import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getLead, listUsers, listActivities, getLeadHistory } from '$lib/server/db/leads';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [lead, users] = await Promise.all([getLead(params.id), listUsers()]);

	if (!lead) throw error(404, 'Lead not found');

	const [activities, leadHistory] = await Promise.all([
		listActivities(lead.id),
		getLeadHistory(lead.id)
	]);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { lead, activities, leadHistory, me, users };
};
