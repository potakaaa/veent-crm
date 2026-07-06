import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchOrganizers } from '$lib/server/db/organizers';

/**
 * GET /api/organizers?q= — session-authed, read-only organizer name search.
 * Backs the meeting-create organizer pre-fill combobox (GitHub #188). Minimal
 * `{ id, name }[]` response, capped at 20 rows.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const q = url.searchParams.get('q');
	const organizers = await searchOrganizers(q, 20);
	return json({ organizers });
};
