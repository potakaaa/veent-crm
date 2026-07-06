import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addNoteSchema } from '$lib/zod/schemas';
import { updateNote } from '$lib/server/db/notes';

// PATCH — edit a note's content (GitHub #192/#193). Only the original author may
// edit; a note not found or owned by someone else both resolve to 404 so a caller
// can't probe for the existence of another user's note.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

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

	const note = await updateNote(params.id, locals.user.id, parsed.data.content);
	if (!note) throw error(404, 'Note not found');
	return json(note);
};
