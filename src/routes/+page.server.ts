import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getTodayQueue } from '$lib/server/db/leads';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const leads = await getTodayQueue(locals.user.id);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { me, leads };
};
