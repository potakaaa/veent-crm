import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDueReminders } from '$lib/server/reminders';
import { getDueMeetingReminders } from '$lib/server/db/meeting-reminders';

// Secret-authed (NOT cookie) endpoint n8n calls to fetch each rep's due/overdue list.
// n8n holds no DATABASE_URL — same clean boundary as the scraper ingest. See sales-crm.md §Reminders.
export const GET: RequestHandler = async ({ request }) => {
	const secret = env.REMINDERS_ENDPOINT_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

	// Require a configured secret; fail closed (matches the /api/reminders/notify sibling).
	if (!secret || provided !== secret) throw error(401, 'unauthorized');

	const due = await getDueReminders(); // STUB returns []
	// Read-only preview of due meeting-reminder checkpoints. MUST NOT mark anything sent —
	// a GET poll marking-sent would burn checkpoints. Marking happens only in POST /notify.
	const meetingsDue = await getDueMeetingReminders();
	return json({ due, meetingsDue });
};
