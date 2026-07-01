// Pure, branded meeting-reminder digest HTML builder.
// MUST stay pure: no imports from $env or resend — unit-testable with no env setup.
// Inline CSS only (email clients strip <style> blocks). Table-based layout for client compatibility.
// Mirrors email-templates/reminder.ts (follow-up digest) for visual consistency — sibling, not shared.
import { REMINDER_TZ } from '$lib/server/reminders';
import type {
	MeetingReminderCheckpoint,
	MeetingReminderDue
} from '$lib/server/db/meeting-reminders';

// --- Veent design system palette (matches reminder.ts exactly) --------------
const COLOR = {
	canvas: '#f3e9e6',
	panel: '#ffffff',
	primary: '#c0362c',
	ink: '#261617',
	body: '#43282a',
	muted: '#a89490',
	mono: '#6e5c5a',
	subtext: '#5a4a48',
	hairline: '#efe2e0',
	day: '#c2710c',
	hour: '#e11d48'
};

const FONT_SERIF = "Georgia,'Spectral',serif";
const FONT_SANS = "'Inter',Arial,sans-serif";

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatMeetingDate(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return esc(iso);
	const date = d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: REMINDER_TZ
	});
	const time = d.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone: REMINDER_TZ
	});
	return `${date} &middot; ${time}`;
}

const CHECKPOINT_META: Record<
	MeetingReminderCheckpoint,
	{ sectionLabel: string; badgeLabel: string; color: string }
> = {
	day: { sectionLabel: 'Tomorrow', badgeLabel: 'In 1 day', color: COLOR.day },
	hour: { sectionLabel: 'In 1 hour', badgeLabel: 'In 1 hour', color: COLOR.hour }
};

function meetingCard(r: MeetingReminderDue, appUrl: string): string {
	const meta = CHECKPOINT_META[r.checkpoint];
	const href = `${appUrl}/leads/${encodeURIComponent(r.leadId)}`;
	return `
<tr><td style="padding:0 0 12px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:${COLOR.canvas};border-radius:8px;border:1px solid ${COLOR.hairline};">
    <tr><td style="padding:14px 18px;">
      <div style="font-family:${FONT_SERIF};font-weight:600;font-size:16px;color:${COLOR.ink};line-height:1.3;">${esc(r.leadName)}</div>
      <div style="font-family:${FONT_SANS};font-size:13px;color:${COLOR.mono};margin-top:4px;">${formatMeetingDate(r.startAt)}</div>
      <div style="margin-top:10px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;background-color:${meta.color};color:#ffffff;font-family:${FONT_SANS};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${meta.badgeLabel}</span>
        <a href="${esc(href)}" style="display:inline-block;margin-left:10px;background-color:${COLOR.primary};color:#ffffff;font-family:${FONT_SANS};font-weight:700;font-size:13px;text-decoration:none;border-radius:6px;padding:5px 14px;">View Lead &rarr;</a>
      </div>
    </td></tr>
  </table>
</td></tr>`;
}

function sectionHeader(label: string, color: string): string {
	return `
<tr><td style="padding:4px 0 8px 0;">
  <div style="font-family:${FONT_SANS};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:${color};">${label}</div>
  <div style="height:1px;background-color:${COLOR.hairline};margin-top:4px;"></div>
</td></tr>`;
}

export function buildMeetingReminderDigestHtml({
	appUrl,
	reminders
}: {
	appUrl: string;
	reminders: MeetingReminderDue[];
}): string {
	const dayReminders = reminders.filter((r) => r.checkpoint === 'day');
	const hourReminders = reminders.filter((r) => r.checkpoint === 'hour');
	const total = reminders.length;

	const summary =
		total === 0
			? 'No meeting reminders right now.'
			: `You have ${total} upcoming meeting${total > 1 ? 's' : ''} to prepare for.`;

	const hourRows =
		hourReminders.length > 0
			? sectionHeader(CHECKPOINT_META.hour.sectionLabel, COLOR.hour) +
				hourReminders.map((r) => meetingCard(r, appUrl)).join('')
			: '';

	const dayRows =
		dayReminders.length > 0
			? sectionHeader(CHECKPOINT_META.day.sectionLabel, COLOR.day) +
				dayReminders.map((r) => meetingCard(r, appUrl)).join('')
			: '';

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

  <!-- Top accent stripe -->
  <tr><td style="height:4px;background-color:${COLOR.primary};font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Veent wordmark -->
  <tr><td style="padding:28px 36px 8px 36px;">
    <div style="font-family:${FONT_SERIF};font-weight:700;font-size:22px;color:${COLOR.primary};line-height:1.2;">Veent</div>
    <div style="font-family:${FONT_SANS};font-size:11px;color:${COLOR.subtext};letter-spacing:0.3px;margin-top:2px;">Outreach Console</div>
  </td></tr>

  <!-- Heading -->
  <tr><td style="padding:16px 36px 0 36px;">
    <h1 style="margin:0;font-family:${FONT_SERIF};font-weight:600;font-size:24px;color:${COLOR.ink};line-height:1.3;">Your upcoming meetings</h1>
  </td></tr>

  <!-- Summary line -->
  <tr><td style="padding:10px 36px 0 36px;">
    <p style="margin:0;font-family:${FONT_SANS};font-size:15px;color:${COLOR.body};line-height:1.6;">${summary}</p>
  </td></tr>

  <!-- Meeting cards -->
  ${
		total > 0
			? `<tr><td style="padding:20px 36px 4px 36px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${hourRows}
      ${dayRows}
    </table>
  </td></tr>`
			: ''
	}

  <!-- Footer -->
  <tr><td style="padding:${total > 0 ? '16px' : '28px'} 36px 28px 36px;">
    <hr style="border:none;border-top:1px solid ${COLOR.hairline};margin:0 0 16px 0;" />
    <p style="margin:0;font-family:${FONT_SANS};font-size:11px;color:${COLOR.muted};text-align:center;line-height:1.5;">Veent &middot; you&rsquo;re receiving this because you&rsquo;re on an upcoming meeting</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
