import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { categoryCreateSchema } from '$lib/zod/schemas';
import {
	getActiveCategories,
	createCategory,
	DUPLICATE_NAME_ERROR
} from '$lib/server/db/categories';

// GET — list all active (non-deleted) categories, alphabetically. Any authed user.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const categories = await getActiveCategories();
	return json({ categories });
};

// POST — create a new category. Any authed user. 400 on validation fail, 409 on
// case-insensitive duplicate name, 201 with the created category on success.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = categoryCreateSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	try {
		const category = await createCategory(
			parsed.data.name,
			parsed.data.color ?? null,
			locals.user.id
		);
		return json({ category }, { status: 201 });
	} catch (e) {
		if (e instanceof Error && e.message === DUPLICATE_NAME_ERROR) {
			throw error(409, 'A category with that name already exists');
		}
		throw e;
	}
};
