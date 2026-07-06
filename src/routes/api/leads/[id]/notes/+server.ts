import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addNoteSchema } from '$lib/zod/schemas';
import { getLead } from '$lib/server/db/leads';
import { addNoteToLead } from '$lib/server/db/notes';

// POST — add a note to a lead (GitHub #192). Any authenticated user who can view
// the lead may add a note; notes are collaborative, not owner-gated.
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

	const parsed = addNoteSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const note = await addNoteToLead(
		params.id,
		locals.user.id,
		locals.user.name,
		parsed.data.content
	);
	return json(note);
};
