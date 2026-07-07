import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { categoryRenameSchema } from '$lib/zod/schemas';
import {
	renameCategory,
	softDeleteCategory,
	DUPLICATE_NAME_ERROR
} from '$lib/server/db/categories';
import { isManagerRole } from '$lib/utils/permissions';

// PATCH — rename/update a category. Manager-only (403 for reps). 400 on validation
// fail, 404 if not found, 409 on case-insensitive duplicate name, 200 on success.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!isManagerRole(locals.user.role)) throw error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = categoryRenameSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	try {
		const category = await renameCategory(params.id, parsed.data.name, parsed.data.color);
		if (!category) throw error(404, 'Category not found');
		return json({ category });
	} catch (e) {
		if (e instanceof Error && e.message === DUPLICATE_NAME_ERROR) {
			throw error(409, 'A category with that name already exists');
		}
		throw e;
	}
};

// DELETE — soft-delete a category (and its lead assignments). Manager-only (403 for
// reps). 404 if not found, 200 on success.
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!isManagerRole(locals.user.role)) throw error(403, 'Forbidden');

	const deleted = await softDeleteCategory(params.id);
	if (!deleted) throw error(404, 'Category not found');
	return json({ success: true });
};
