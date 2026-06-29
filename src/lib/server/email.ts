// Resend email — sends magic-link + reminder digests.
// Sender must be an SPF/DKIM-verified domain (env RESEND_FROM).
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

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
