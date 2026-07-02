import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promoteSuperManager, PermissionError } from '$lib/server/db/users';
import { canPromoteToSuperManager } from '$lib/utils/permissions';

/**
 * PATCH /api/users/[id]/promote-super — transfer the singleton super_manager role
 * to the target member. Only the current super_manager may do this; the current
 * holder is atomically demoted to manager inside promoteSuperManager.
 * A concurrent transfer trips the partial unique index (23505) → 409.
 */
export const PATCH: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!canPromoteToSuperManager(locals.user)) throw error(403, 'Super manager only');

	try {
		const user = await promoteSuperManager(params.id);
		return json(user);
	} catch (err) {
		if (err instanceof PermissionError) throw error(403, err.message);
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			return json({ error: 'conflict' }, { status: 409 });
		}
		throw err;
	}
};
