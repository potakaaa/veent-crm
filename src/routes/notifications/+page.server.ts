import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listNotifications } from '$lib/server/db/notifications';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const notifications = await listNotifications(locals.user.id);
	return { notifications };
};
