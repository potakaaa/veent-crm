import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDueReminders } from '$lib/server/reminders';

// Secret-authed (NOT cookie) endpoint n8n calls to fetch each rep's due/overdue list.
// n8n holds no DATABASE_URL — same clean boundary as the scraper ingest. See sales-crm.md §Reminders.
export const GET: RequestHandler = async ({ request }) => {
	const secret = env.REMINDERS_ENDPOINT_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

	// STUB: if no secret is configured (v0), allow; once set, require a match.
	if (secret && provided !== secret) throw error(401, 'unauthorized');

	const due = await getDueReminders(); // STUB returns []
	return json({ due });
};
