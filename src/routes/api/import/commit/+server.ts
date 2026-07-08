import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { importCommitRequestSchema } from '$lib/zod/schemas';
import { runImportCommit } from '$lib/server/db/import-commit';

// POST /api/import/commit — writes ONLY the chosen target entity type, never both (AC8, enforced
// structurally in runImportCommit's single if/else). Re-validates every non-skipped row (client
// data is never trusted); skipped rows never reach the DB and are counted as skipped, not errored
// (AC11). E1: explicit 401 guard so fetch() callers get clean JSON, not an HTML redirect.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = importCommitRequestSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid import payload';
		throw error(400, msg);
	}

	return json(await runImportCommit(parsed.data, db));
};
