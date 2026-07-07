import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchVenues } from '$lib/server/db/meetings';

/**
 * GET /api/meetings/venues?q= — session-authed, read-only venue name search.
 * Backs the meeting create/edit venue free-text combobox suggestions (GitHub #249, MTG-5).
 * Returns a flat `string[]` of DISTINCT past venue names, capped at 20 rows.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const q = url.searchParams.get('q');
	const venues = await searchVenues(q, 20);
	return json({ venues });
};
