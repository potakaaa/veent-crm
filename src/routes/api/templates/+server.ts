import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { templateFormSchema } from '$lib/zod/schemas';
import {
	createTemplate,
	updateTemplate,
	softDeleteTemplate,
	TemplateTitleConflictError
} from '$lib/server/db/templates';
import { isManager } from '$lib/utils/permissions';

function requireManager(locals: App.Locals): void {
	if (!locals.user || !isManager(locals.user)) {
		throw error(403, 'Manager only');
	}
}

// POST — create a template. 201 + row / 400 invalid / 401 unauthed.
// GitHub #199: any authenticated user (reps included) may create; edit/delete stay manager-only.
// `createdBy` is sourced server-side from the session, never from the request body.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const parsed = templateFormSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid payload');
	}

	try {
		const row = await createTemplate(parsed.data, locals.user.id);
		return json(row, { status: 201 });
	} catch (err) {
		if (err instanceof TemplateTitleConflictError) throw error(409, err.message);
		throw err;
	}
};

// PATCH — edit a template. 200 + row / 400 invalid / 403 non-manager / 404 missing.
export const PATCH: RequestHandler = async ({ request, locals }) => {
	requireManager(locals);

	const raw = (await request.json().catch(() => null)) as
		| (Record<string, unknown> & { id?: unknown })
		| null;
	const id = raw && typeof raw.id === 'string' ? raw.id : null;
	if (!id) {
		throw error(400, 'Missing template id');
	}

	const parsed = templateFormSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid payload');
	}

	try {
		const row = await updateTemplate(id, parsed.data);
		if (!row) {
			throw error(404, 'Template not found');
		}
		return json(row, { status: 200 });
	} catch (err) {
		if (err instanceof TemplateTitleConflictError) throw error(409, err.message);
		throw err;
	}
};

// DELETE — soft-delete a template. 204 / 403 non-manager / 404 missing.
export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireManager(locals);

	const raw = (await request.json().catch(() => null)) as { id?: unknown } | null;
	const id = raw && typeof raw.id === 'string' ? raw.id : null;
	if (!id) {
		throw error(400, 'Missing template id');
	}

	const deleted = await softDeleteTemplate(id);
	if (!deleted) {
		throw error(404, 'Template not found');
	}
	return new Response(null, { status: 204 });
};
