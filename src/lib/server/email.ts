// Resend email — sends magic-link + reminder digests.
// Sender must be an SPF/DKIM-verified domain (env RESEND_FROM).
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
};

const resend = new Resend(env.RESEND_API_KEY);

export async function sendEmail(msg: EmailMessage): Promise<void> {
	const { error } = await resend.emails.send({
		from: env.RESEND_FROM,
		to: msg.to,
		subject: msg.subject,
		html: msg.html
	});
	if (error) {
		throw new Error(`sendEmail failed: ${error.message}`);
	}
}
