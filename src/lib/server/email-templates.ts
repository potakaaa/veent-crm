/**
 * Transactional email templates for Veent CRM.
 *
 * IMPORT-PURE: this module must NOT import `auth.ts`, `db`, or any server runtime
 * dependency — it only builds HTML strings. The crm_users name lookup for
 * personalization belongs in auth.ts's sendMagicLink callback. Keeping this file
 * dependency-free guarantees no circular import (auth.ts → email-templates.ts only).
 *
 * `pendingWelcomeEmails` is a module-level Set shared between POST /api/users
 * (which adds an email before triggering the magic link) and auth.ts's
 * sendMagicLink (which dequeues it to pick the welcome vs login template).
 * Safe in single-process Bun/Node; not safe across replicas — acceptable for v0.
 */

export const pendingWelcomeEmails = new Set<string>();

// --- Veent design system palette (warm wine-on-cream) ----------------------
const COLOR = {
	canvas: '#f3e9e6',
	panel: '#ffffff',
	primary: '#c0362c',
	ink: '#261617',
	body: '#43282a',
	muted: '#a89490',
	mono: '#6e5c5a',
	subtext: '#5a4a48',
	hairline: '#efe2e0'
};

/**
 * Shared shell. Fully-inlined CSS (no <style>/<link>) for email-client
 * compatibility; responsive via a max-width 600px table + viewport meta.
 */
function shell({
	heading,
	subhead,
	ctaLabel,
	url
}: {
	heading: string;
	subhead: string;
	ctaLabel: string;
	url: string;
}): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${COLOR.canvas};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.canvas};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLOR.panel};border-radius:12px;overflow:hidden;border:1px solid ${COLOR.hairline};">
<tr><td style="height:4px;background-color:${COLOR.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 8px 36px;">
<div style="font-family:Georgia,'Spectral',serif;font-weight:700;font-size:22px;color:${COLOR.primary};line-height:1.2;">Veent</div>
<div style="font-family:'Inter',Arial,sans-serif;font-size:11px;color:${COLOR.subtext};letter-spacing:0.3px;margin-top:2px;">Outreach Console</div>
</td></tr>
<tr><td style="padding:16px 36px 0 36px;">
<h1 style="margin:0;font-family:Georgia,'Spectral',serif;font-weight:600;font-size:26px;color:${COLOR.ink};line-height:1.3;">${heading}</h1>
</td></tr>
<tr><td style="padding:14px 36px 0 36px;">
<p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:${COLOR.body};line-height:1.6;">${subhead}</p>
</td></tr>
<tr><td style="padding:28px 36px 0 36px;">
<a href="${url}" style="display:inline-block;background-color:${COLOR.primary};color:#ffffff;font-family:'Inter',Arial,sans-serif;font-weight:700;font-size:16px;text-decoration:none;border-radius:8px;padding:14px 28px;">${ctaLabel}</a>
</td></tr>
<tr><td style="padding:22px 36px 0 36px;">
<p style="margin:0 0 6px 0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:${COLOR.mono};line-height:1.5;">Or paste this link into your browser:</p>
<p style="margin:0;font-family:'Courier New',monospace;font-size:12px;color:${COLOR.mono};word-break:break-all;line-height:1.5;">${url}</p>
</td></tr>
<tr><td style="padding:18px 36px 0 36px;">
<p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:${COLOR.mono};line-height:1.5;">This link is single-use and expires in 5 minutes.</p>
</td></tr>
<tr><td style="padding:28px 36px 28px 36px;">
<hr style="border:none;border-top:1px solid ${COLOR.hairline};margin:0 0 16px 0;" />
<p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:11px;color:${COLOR.muted};text-align:center;line-height:1.5;">Veent &middot; this link is single-use &middot; do not share it</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Welcome / invite email sent when a manager adds a new team member.
 */
export function welcomeEmail(name: string, url: string): { subject: string; html: string } {
	return {
		subject: 'Welcome to Veent CRM — here’s your sign-in link',
		html: shell({
			heading: `Welcome to Veent CRM, ${name}`,
			subhead: 'Your manager has added you to the team. Click below to sign in and get started.',
			ctaLabel: 'Sign in to Veent',
			url
		})
	};
}

/**
 * Regular sign-in magic-link email (from the /login flow).
 */
export function loginEmail(url: string): { subject: string; html: string } {
	return {
		subject: 'Your Veent CRM sign-in link',
		html: shell({
			heading: 'Here’s your sign-in link',
			subhead:
				'Click below to sign in to Veent CRM. This link is single-use and expires in 5 minutes.',
			ctaLabel: 'Sign in',
			url
		})
	};
}
