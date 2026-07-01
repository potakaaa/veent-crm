import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listUsers, listLeads } from '$lib/server/db/leads';
import { listAllMeetings } from '$lib/server/db/meetings';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [meetings, users, leadsFull] = await Promise.all([
		listAllMeetings(),
		listUsers(),
		listLeads()
	]);

	const leads = leadsFull.map((l) => ({ id: l.id, name: l.name }));

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { meetings, users, leads, me };
};
