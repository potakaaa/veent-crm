// Resend email — sends magic-link + reminder digests.
// Sender must be an SPF/DKIM-verified domain (env RESEND_FROM).
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import type { DueReminder } from './reminders';
import type { MeetingReminderDue } from './db/meeting-reminders';
import { buildReminderDigestHtml } from './email-templates/reminder';
import { buildMeetingReminderDigestHtml } from './email-templates/meeting-reminder';

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
 * it no-ops with a warning when RESEND_API_KEY / RESEND_FROM / APP_URL is unset,
 * and logs (does not throw) on send failure — n8n is the primary path, this is the fallback.
 * Returns 'sent', 'skipped', or 'failed' so callers can track delivery accurately.
 */
export async function sendReminderDigest({
	repEmail,
	reminders
}: {
	repEmail: string;
	reminders: DueReminder[];
}): Promise<'sent' | 'skipped' | 'failed'> {
	const from = env.RESEND_FROM;
	const appUrl = env.APP_URL;
	if (!env.RESEND_API_KEY || !from || !appUrl) {
		console.warn('[reminders] RESEND_API_KEY/RESEND_FROM/APP_URL not set — skipping email digest');
		return 'skipped';
	}

	try {
		const html = buildReminderDigestHtml({ appUrl, reminders });
		const resend = new Resend(env.RESEND_API_KEY);
		const { error } = await resend.emails.send({
			from,
			to: repEmail,
			subject: `You have ${reminders.length} reminder${reminders.length > 1 ? 's' : ''} due — Veent`,
			html
		});
		if (error) {
			console.error(`[reminders] sendReminderDigest failed: ${error.message}`);
			return 'failed';
		}
		return 'sent';
	} catch (err) {
		console.error('[reminders] sendReminderDigest threw:', err);
		return 'failed';
	}
}

/**
 * Meeting-reminder digest for n8n — sibling to sendReminderDigest, same no-throw contract:
 * no-ops with a warning ('skipped') when RESEND_API_KEY / RESEND_FROM / APP_URL is unset,
 * logs (does not throw) on send failure ('failed'), else 'sent'. Fully separate from the
 * follow-up digest path — a recipient due for both types gets two emails.
 */
export async function sendMeetingReminderDigest({
	recipientEmail,
	reminders
}: {
	recipientEmail: string;
	reminders: MeetingReminderDue[];
}): Promise<'sent' | 'skipped' | 'failed'> {
	const from = env.RESEND_FROM;
	const appUrl = env.APP_URL;
	if (!env.RESEND_API_KEY || !from || !appUrl) {
		console.warn(
			'[meeting-reminders] RESEND_API_KEY/RESEND_FROM/APP_URL not set — skipping email digest'
		);
		return 'skipped';
	}

	try {
		const html = buildMeetingReminderDigestHtml({ appUrl, reminders });
		const resend = new Resend(env.RESEND_API_KEY);
		const { error } = await resend.emails.send({
			from,
			to: recipientEmail,
			subject: `You have ${reminders.length} meeting reminder${reminders.length > 1 ? 's' : ''} — Veent`,
			html
		});
		if (error) {
			console.error(`[meeting-reminders] sendMeetingReminderDigest failed: ${error.message}`);
			return 'failed';
		}
		return 'sent';
	} catch (err) {
		console.error('[meeting-reminders] sendMeetingReminderDigest threw:', err);
		return 'failed';
	}
}
