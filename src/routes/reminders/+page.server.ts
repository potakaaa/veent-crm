import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getRemindersQueue } from '$lib/server/db/leads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const { overdue, due, upcoming, cold } = await getRemindersQueue(
		locals.user.id,
		locals.user.role
	);

	return { overdue, due, upcoming, cold };
};
