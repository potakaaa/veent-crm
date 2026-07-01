import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDueReminders, groupRemindersByRep } from '$lib/server/reminders';
import { sendReminderDigest, sendMeetingReminderDigest } from '$lib/server/email';
import {
	getDueMeetingReminders,
	markMeetingReminderSent,
	groupMeetingRemindersByRecipient
} from '$lib/server/db/meeting-reminders';

// Secret-authed (NOT cookie) POST endpoint: groups due reminders by rep and sends one
// branded email digest per rep. Same auth boundary as /api/reminders/due — n8n triggers it.
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.REMINDERS_ENDPOINT_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

	if (!secret || provided !== secret) throw error(401, 'unauthorized');

	const due = await getDueReminders();
	const groups = groupRemindersByRep(due);
	const grouped = groups.reduce((n, g) => n + g.reminders.length, 0);
	const skipped = due.length - grouped; // null-rep reminders dropped by grouping

	let sent = 0;
	for (const group of groups) {
		const status = await sendReminderDigest({
			repEmail: group.repEmail,
			reminders: group.reminders
		});
		if (status === 'sent') sent++;
	}

	// --- Meeting reminders (fully separate path; two emails if a recipient is due for both) ---
	// 1. fetch due candidates (empty-recipient candidates already excluded by the query)
	const meetingDue = await getDueMeetingReminders();
	// 2. atomic mark-sent per candidate; keep ONLY winners (exactly-once — no duplicate send)
	const winners: typeof meetingDue = [];
	for (const candidate of meetingDue) {
		const won = await markMeetingReminderSent(candidate.meetingId, candidate.checkpoint);
		if (won) winners.push(candidate);
	}
	// 3. group winners into one digest per recipient email
	const meetingGroups = groupMeetingRemindersByRecipient(winners);
	// 4. send one meeting digest per recipient
	let meetingSent = 0;
	let meetingSkipped = 0;
	for (const group of meetingGroups) {
		const status = await sendMeetingReminderDigest({
			recipientEmail: group.recipientEmail,
			reminders: group.reminders
		});
		if (status === 'sent') meetingSent++;
		else if (status === 'skipped') meetingSkipped++;
	}

	return json({ sent, skipped, meetingSent, meetingSkipped });
};
