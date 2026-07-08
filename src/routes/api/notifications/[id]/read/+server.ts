import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markNotificationRead } from '$lib/server/db/notifications';

export const PATCH: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// markNotificationRead is atomically ownership-scoped (WHERE id = id AND user_id =
	// userId), so a non-owner gets null → 404 (existence is not leaked to a non-owner).
	const result = await markNotificationRead(params.id, locals.user.id);
	if (!result) throw error(404, 'Notification not found');

	return json(result);
};
