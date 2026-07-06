import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addNoteSchema } from '$lib/zod/schemas';
import { getOrganizer } from '$lib/server/db/organizers';
import { addNoteToOrganizer } from '$lib/server/db/notes';

// POST — add a note to an organizer (GitHub #193). Any authenticated user may add
// a note; notes are collaborative, not owner-gated.
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const organizer = await getOrganizer(params.id);
	if (!organizer) throw error(404, 'Organizer not found');

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

	const note = await addNoteToOrganizer(params.id, locals.user.id, parsed.data.content);
	return json(note);
};
