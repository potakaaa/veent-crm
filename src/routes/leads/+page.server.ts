import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeads, listUsers } from '$lib/server/db/leads';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [leads, users] = await Promise.all([listLeads(), listUsers()]);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { leads, users, me };
};
