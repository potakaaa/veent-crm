// Resend email — sends magic-link + reminder digests.
// Sender must be an SPF/DKIM-verified domain (env RESEND_FROM).
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import type { DueReminder } from './reminders';

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
	const from = env.RESEND_FROM;
	if (!from) throw new Error('RESEND_FROM env var is not set');
	if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY env var is not set');
	const resend = new Resend(env.RESEND_API_KEY);
	const { error } = await resend.emails.send({
		from,
		to: msg.to,
		subject: msg.subject,
		html: msg.html
	});
	if (error) {
		throw new Error(`sendEmail failed: ${error.message}`);
	}
}

/**
 * Email-fallback reminder digest for n8n. Unlike sendEmail, this NEVER throws:
 * it no-ops with a warning when RESEND_API_KEY / RESEND_FROM is unset, and logs
 * (does not throw) on send failure — n8n is the primary path, this is the fallback.
 */
export async function sendReminderDigest({
	repEmail,
	reminders
}: {
	repEmail: string;
	reminders: DueReminder[];
}): Promise<void> {
	const from = env.RESEND_FROM;
	if (!env.RESEND_API_KEY || !from) {
		console.warn('[reminders] RESEND_API_KEY not set — skipping email digest');
		return;
	}

	try {
		const escHtml = (s: string) =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		const items = reminders
			.map(
				(r) =>
					`<li>${escHtml(r.leadName)} — follow up ${r.followUpAt}${r.overdue ? ' <strong>(overdue)</strong>' : ''}</li>`
			)
			.join('');
		const html = `<p>You have ${reminders.length} follow-up(s) due:</p><ul>${items}</ul>`;
		const resend = new Resend(env.RESEND_API_KEY);
		const { error } = await resend.emails.send({
			from,
			to: repEmail,
			subject: `Follow-up reminders (${reminders.length})`,
			html
		});
		if (error) {
			console.error(`[reminders] sendReminderDigest failed: ${error.message}`);
		}
	} catch (err) {
		console.error('[reminders] sendReminderDigest threw:', err);
	}
}
