import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getRemindersQueue } from '$lib/server/db/leads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const { overdue, cold } = await getRemindersQueue(locals.user.id);

	// Concatenate in display order; the component groups by urgency.
	return { leads: [...overdue, ...cold] };
};
