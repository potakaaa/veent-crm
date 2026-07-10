import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { USER_ROLES } from '$lib/zod/schemas';
import { db } from '$lib/server/db';
import { crmUsers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { dbUserToUser } from '$lib/server/db/leads';
import { isManagerRole } from '$lib/utils/permissions';

const patchSchema = z.object({
	firstName: z.string().min(1).optional(),
	lastName: z.string().optional(),
	role: z.enum(USER_ROLES).optional(),
	active: z.boolean().optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.nullable()
		.optional()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = patchSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) throw error(400, body.error.issues[0]?.message ?? 'Invalid payload');

	const { firstName, lastName, role, active, color } = body.data;

	const isSelf = params.id === locals.user.id;

	if (isSelf) {
		// Self-edits can only ever change the name — role/active are rejected
		// outright (whole request), regardless of the actor's own role.
		if (role !== undefined || active !== undefined) {
			throw error(403, 'You cannot change your own role or status');
		}

		// Color is manager-administered data (GitHub #275) — unlike name, reps
		// cannot set their own color, even via a self-edit request.
		if (color !== undefined && !isManagerRole(locals.user.role)) {
			throw error(403, 'Only managers can change color');
		}
	} else {
		// Role changes require super_manager.
		if (role !== undefined && locals.user.role !== 'super_manager') {
			throw error(403, 'Only super managers can change roles');
		}

		// Active toggle requires manager or super_manager.
		if (active !== undefined && !isManagerRole(locals.user.role)) {
			throw error(403, 'Forbidden');
		}

		// Renaming another user requires manager or super_manager.
		if ((firstName !== undefined || lastName !== undefined) && !isManagerRole(locals.user.role)) {
			throw error(403, 'Forbidden');
		}

		// Setting another user's color requires manager or super_manager.
		if (color !== undefined && !isManagerRole(locals.user.role)) {
			throw error(403, 'Forbidden');
		}
	}

	const [row] = await db
		.update(crmUsers)
		.set({
			...(firstName !== undefined ? { firstName } : {}),
			...(lastName !== undefined ? { lastName } : {}),
			...(role !== undefined ? { role } : {}),
			...(active !== undefined ? { active } : {}),
			...(color !== undefined ? { color } : {}),
			updatedAt: new Date()
		})
		.where(eq(crmUsers.id, params.id))
		.returning();

	if (!row) throw error(404, 'User not found');

	return json(dbUserToUser(row));
};
