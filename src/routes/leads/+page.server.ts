import type { PageServerLoad } from './$types';
import { listLeads, listUsers } from '$lib/server/db/leads';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	const [leads, users] = await Promise.all([listLeads(), listUsers()]);

	const me: User = {
		id: locals.user!.id,
		email: locals.user!.email,
		name: locals.user!.name,
		role: locals.user!.role,
		active: true
	};

	return { leads, users, me };
};
