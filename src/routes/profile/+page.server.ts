import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { sessionToUser } from '$lib/server/db/users';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	return { currentUser: sessionToUser(locals.user) };
};
