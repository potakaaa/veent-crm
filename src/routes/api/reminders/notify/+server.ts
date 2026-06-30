import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDueReminders, groupRemindersByRep } from '$lib/server/reminders';
import { sendReminderDigest } from '$lib/server/email';

// Secret-authed (NOT cookie) POST endpoint: groups due reminders by rep and sends one
// branded email digest per rep. Same auth boundary as /api/reminders/due — n8n triggers it.
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.REMINDERS_ENDPOINT_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

	// STUB: if no secret is configured (v0), allow; once set, require a match.
	if (secret && provided !== secret) throw error(401, 'unauthorized');

	const due = await getDueReminders();
	const groups = groupRemindersByRep(due);
	const grouped = groups.reduce((n, g) => n + g.reminders.length, 0);
	const skipped = due.length - grouped; // null-rep reminders dropped by grouping

	for (const group of groups) {
		try {
			await sendReminderDigest({ repEmail: group.repEmail, reminders: group.reminders });
		} catch (err) {
			// One rep's failure must not abort the rest.
			console.error(`[reminders] notify dispatch failed for ${group.repEmail}:`, err);
		}
	}

	return json({ sent: groups.length, skipped });
};
