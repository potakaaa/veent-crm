// Resend email — STUB for v0. See sales-crm.md §Reminders / §Access & auth.
// Real impl sends magic-link + reminder digests from an SPF/DKIM-verified domain.
// No RESEND_API_KEY is used in this skeleton; calls just log.

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
};

// TODO(resend): construct `new Resend(env.RESEND_API_KEY)` and call resend.emails.send(...)
export async function sendEmail(msg: EmailMessage): Promise<void> {
	console.info(`[email:stub] would send "${msg.subject}" -> ${msg.to}`);
}
