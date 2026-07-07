import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assignCategoriesSchema } from '$lib/zod/schemas';
import { getLead } from '$lib/server/db/leads';
import { getCategoriesForLead, assignCategory, removeAssignment } from '$lib/server/db/categories';

// GET — categories assigned to this lead. Any authed user who can view the lead.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!lead) throw error(404, 'Lead not found');

	const categories = await getCategoriesForLead(params.id);
	return json({ categories });
};

// POST — assign a category to this lead. Idempotent (ON CONFLICT DO NOTHING).
// Any authed user who can view the lead. 400 on validation fail, 200 on success.
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!lead) throw error(404, 'Lead not found');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = assignCategoriesSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	await assignCategory(params.id, parsed.data.categoryId);
	return json({ success: true });
};

// DELETE — remove a category assignment from this lead. Any authed user who can view
// the lead. 400 on validation fail, 200 on success.
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!lead) throw error(404, 'Lead not found');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = assignCategoriesSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	await removeAssignment(params.id, parsed.data.categoryId);
	return json({ success: true });
};
