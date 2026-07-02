import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deactivateUser,
	reactivateUser,
	updateUserRole,
	PermissionError
} from '$lib/server/db/users';

/**
 * PATCH /api/users/[id] — deactivate/reactivate a member, or change their role.
 *
 * Body: `{ active?: boolean, role?: 'rep' | 'manager' }`
 *  - `active: false` → deactivate (server-side lead reassignment happens in deactivateUser)
 *  - `active: true`  → reactivate
 *  - `role`          → rep↔manager transition (super_manager actor only)
 *
 * All actor-permission checks live in the users.ts DB layer (never trust the
 * client). Permission failures map to 403; a unique-index conflict (23505) → 409.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: { active?: unknown; role?: unknown };
	try {
		const parsed = await request.json();
		if (typeof parsed !== 'object' || parsed === null) throw new Error();
		body = parsed as typeof body;
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const wantsActive = typeof body.active === 'boolean' ? body.active : undefined;
	const wantsRole = body.role;

	if (wantsActive === undefined && wantsRole === undefined) {
		throw error(400, 'Nothing to update — provide `active` or `role`');
	}

	if (wantsRole !== undefined && wantsRole !== 'rep' && wantsRole !== 'manager') {
		// Rejects unknown roles AND a direct super_manager assignment — that must
		// go through PATCH /api/users/[id]/promote-super.
		throw error(400, 'role must be "rep" or "manager"');
	}

	try {
		let user;
		if (wantsRole !== undefined) {
			user = await updateUserRole(locals.user.id, params.id, wantsRole);
		}
		if (wantsActive === false) {
			user = await deactivateUser(locals.user.id, params.id);
		} else if (wantsActive === true) {
			user = await reactivateUser(locals.user.id, params.id);
		}
		return json(user);
	} catch (err) {
		if (err instanceof PermissionError) throw error(403, err.message);
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			return json({ error: 'conflict' }, { status: 409 });
		}
		throw err;
	}
};
