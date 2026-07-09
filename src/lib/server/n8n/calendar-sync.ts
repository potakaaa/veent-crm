/**
 * Calendar sync orchestration module (NCAL-3). SERVER-ONLY.
 *
 * Provides pure payload builders and sync orchestrators that wire CRM mutations
 * to Nextcloud via the existing NCAL-2 write client (`src/lib/caldav/writer.ts`).
 *
 * Design invariants:
 *  - Never imports `db` directly — delegates to named DB helper functions.
 *  - Never imported from .svelte files (server-only).
 *  - Pure helpers (`manilaAllDayRange`, `build*Payload`) have no side effects and
 *    are exported for direct unit testing.
 *  - Sync orchestrators re-throw `CalDavWebhookError` on n8n failure; callers
 *    choose whether to await (manual-sync routes, 502 on failure) or fire-and-forget
 *    (`void fn().catch(console.error)` for auto-sync paths).
 */

import {
	createEvent,
	updateEvent,
	deleteEvent,
	embedCrmHref,
	type CalendarEventPayload
} from '$lib/caldav/writer';
import { updateMeetingNextcloudUid } from '$lib/server/db/meetings';
import { updateLeadNextcloudUids } from '$lib/server/db/leads';
import type { Lead } from '$lib/types';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Converts a `YYYY-MM-DD` Manila calendar date to UTC start/end bounds.
 *
 * Manila is UTC+8 with no DST. Manila midnight on `dateStr` equals
 * `dateStr T16:00:00Z` (same UTC calendar date, 16:00). Manila 23:59:59
 * equals the NEXT UTC calendar date at `T15:59:59Z`.
 *
 * Example: `'2026-08-15'` → `{ start: '2026-08-15T16:00:00Z', end: '2026-08-16T15:59:59Z' }`
 */
export function manilaAllDayRange(dateStr: string): { start: string; end: string } {
	const start = `${dateStr}T16:00:00Z`;

	// Next UTC calendar day for the end bound.
	const [year, month, day] = dateStr.split('-').map(Number);
	const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
	const pad = (n: number) => String(n).padStart(2, '0');
	const nextDateStr = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
	const end = `${nextDateStr}T15:59:59Z`;

	return { start, end };
}

/**
 * Builds a `CalendarEventPayload` for a CRM meeting.
 *
 * - Title is `"Meeting with {leadOrganizerName ?? leadName}"`, falling back to `'Team Meeting'`.
 * - End = startAt + 1 hour (no endAt column exists on crm_meetings).
 * - Embeds `CRM-HREF:/meetings/{id}` into the description via `embedCrmHref`.
 * - Also embeds the lead href into description when leadId is present.
 */
export function buildMeetingPayload(meeting: {
	id: string;
	leadId: string | null;
	leadName?: string | null;
	leadOrganizerName?: string | null;
	organizerName?: string | null;
	attendees?: Array<{ name: string }>;
	meetingUrl?: string | null;
	startAt: Date | string;
	venue: string | null | undefined;
	notes: string | null | undefined;
	outcome?: string | null;
	nextcloudUid?: string | null;
}): CalendarEventPayload {
	const uid = meeting.nextcloudUid ?? crypto.randomUUID();
	const startIso =
		meeting.startAt instanceof Date ? meeting.startAt.toISOString() : meeting.startAt;
	const endMs = new Date(startIso).getTime() + 60 * 60 * 1000;
	const endIso = new Date(endMs).toISOString();

	// Build structured description body.
	const lines: string[] = [];
	if (meeting.organizerName) lines.push(`Host: ${meeting.organizerName}`);
	if (meeting.attendees?.length) {
		lines.push(`Attendees: ${meeting.attendees.map((a) => a.name).join(', ')}`);
	}
	if (meeting.meetingUrl) lines.push(`Meeting link: ${meeting.meetingUrl}`);
	if (meeting.notes) lines.push(`Notes: ${meeting.notes}`);
	if (meeting.outcome) lines.push(`Outcome: ${meeting.outcome}`);

	const body = lines.length ? lines.join('\n') : undefined;
	const description = embedCrmHref(`/meetings/${meeting.id}`, body);

	const label = meeting.leadOrganizerName ?? meeting.leadName ?? null;
	const payload: CalendarEventPayload = {
		uid,
		title: label ? `Meeting with ${label}` : 'Team Meeting',
		start: startIso,
		end: endIso
	};
	if (meeting.venue != null) payload.location = meeting.venue;
	if (description !== undefined) payload.description = description;
	return payload;
}

/**
 * Builds a `CalendarEventPayload` for a lead's go-live (ticket sale start) date.
 * Uses Manila all-day UTC range for start/end. Embeds CRM-HREF:/leads/{id}.
 */
export function buildGoLiveDatePayload(lead: {
	id: string;
	organizerName?: string | null;
	eventName?: string | null;
	goLiveDate: string;
}): CalendarEventPayload {
	const { start, end } = manilaAllDayRange(lead.goLiveDate);
	const label = lead.organizerName ?? lead.eventName ?? 'Lead';
	const uid = crypto.randomUUID();
	const description = embedCrmHref(`/leads/${lead.id}`, undefined);
	const payload: CalendarEventPayload = {
		uid,
		title: `${label} — Ticket Sale Start`,
		start,
		end
	};
	if (description !== undefined) payload.description = description;
	return payload;
}

/**
 * Builds a `CalendarEventPayload` for a lead's event date.
 * Uses Manila all-day UTC range for start/end. Embeds CRM-HREF:/leads/{id}.
 */
export function buildEventDatePayload(lead: {
	id: string;
	organizerName?: string | null;
	eventName?: string | null;
	eventDate: string;
}): CalendarEventPayload {
	const { start, end } = manilaAllDayRange(lead.eventDate);
	const label = lead.organizerName ?? lead.eventName ?? 'Lead';
	const uid = crypto.randomUUID();
	const description = embedCrmHref(`/leads/${lead.id}`, undefined);
	const payload: CalendarEventPayload = {
		uid,
		title: `${label} — Event Date`,
		start,
		end
	};
	if (description !== undefined) payload.description = description;
	return payload;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strips `uid` from a payload so it can be passed to `updateEvent(uid, rest)`. */
function withoutUid(payload: CalendarEventPayload): Omit<CalendarEventPayload, 'uid'> {
	const { uid: _discarded, ...rest } = payload;
	void _discarded;
	return rest;
}

// ---------------------------------------------------------------------------
// Sync orchestrators
// ---------------------------------------------------------------------------

/**
 * Syncs a meeting to Nextcloud:
 * - If `meeting.nextcloudUid` is present → updates the existing event.
 * - Else → creates a new event and writes the returned UID back to the DB.
 *
 * Returns the effective UID. Throws `CalDavWebhookError` on n8n failure.
 */
export async function syncMeetingToNextcloud(meeting: {
	id: string;
	leadId: string | null;
	leadName?: string | null;
	leadOrganizerName?: string | null;
	organizerName?: string | null;
	attendees?: Array<{ name: string }>;
	meetingUrl?: string | null;
	startAt: Date | string;
	venue: string | null | undefined;
	notes: string | null | undefined;
	outcome?: string | null;
	nextcloudUid?: string | null;
}): Promise<string> {
	const payload = buildMeetingPayload(meeting);
	if (meeting.nextcloudUid) {
		await updateEvent(meeting.nextcloudUid, withoutUid(payload));
		return meeting.nextcloudUid;
	} else {
		const { uid } = await createEvent(payload);
		await updateMeetingNextcloudUid(meeting.id, uid);
		return uid;
	}
}

/**
 * Removes a meeting's Nextcloud event and clears the stored UID.
 * Throws `CalDavWebhookError` on n8n failure.
 */
export async function deleteMeetingFromNextcloud(meetingId: string, uid: string): Promise<void> {
	await deleteEvent(uid);
	await updateMeetingNextcloudUid(meetingId, null);
}

/**
 * Syncs a lead's go-live and event dates to Nextcloud using 3-branch logic per date field:
 *
 * 1. Date set + no UID → create event, write UID back to DB
 * 2. Date set + UID exists → update event
 * 3. Date cleared + UID exists → delete event, clear UID in DB
 *
 * Both date fields are processed; the first encountered error is re-thrown after both complete.
 * Throws `CalDavWebhookError` if any n8n call fails.
 */
export async function syncLeadDatesToNextcloud(
	lead: Lead,
	prev: {
		goLiveDate?: string | null;
		eventDate?: string | null;
		nextcloudGoLiveUid?: string | null;
		nextcloudEventUid?: string | null;
	}
): Promise<void> {
	const errors: unknown[] = [];

	// --- goLiveDate branch ---
	try {
		if (lead.goLiveDate && !prev.nextcloudGoLiveUid) {
			const payload = buildGoLiveDatePayload({
				id: lead.id,
				organizerName: lead.organizerName,
				eventName: lead.eventName,
				goLiveDate: lead.goLiveDate
			});
			const { uid } = await createEvent(payload);
			await updateLeadNextcloudUids(lead.id, { nextcloudGoLiveUid: uid });
		} else if (lead.goLiveDate && prev.nextcloudGoLiveUid) {
			const payload = buildGoLiveDatePayload({
				id: lead.id,
				organizerName: lead.organizerName,
				eventName: lead.eventName,
				goLiveDate: lead.goLiveDate
			});
			await updateEvent(prev.nextcloudGoLiveUid, withoutUid(payload));
		} else if (!lead.goLiveDate && prev.nextcloudGoLiveUid) {
			await deleteEvent(prev.nextcloudGoLiveUid);
			await updateLeadNextcloudUids(lead.id, { nextcloudGoLiveUid: null });
		}
		// else: no date, no UID → nothing to do
	} catch (e) {
		errors.push(e);
	}

	// --- eventDate branch ---
	try {
		if (lead.eventDate && !prev.nextcloudEventUid) {
			const payload = buildEventDatePayload({
				id: lead.id,
				organizerName: lead.organizerName,
				eventName: lead.eventName,
				eventDate: lead.eventDate
			});
			const { uid } = await createEvent(payload);
			await updateLeadNextcloudUids(lead.id, { nextcloudEventUid: uid });
		} else if (lead.eventDate && prev.nextcloudEventUid) {
			const payload = buildEventDatePayload({
				id: lead.id,
				organizerName: lead.organizerName,
				eventName: lead.eventName,
				eventDate: lead.eventDate
			});
			await updateEvent(prev.nextcloudEventUid, withoutUid(payload));
		} else if (!lead.eventDate && prev.nextcloudEventUid) {
			await deleteEvent(prev.nextcloudEventUid);
			await updateLeadNextcloudUids(lead.id, { nextcloudEventUid: null });
		}
		// else: no date, no UID → nothing to do
	} catch (e) {
		errors.push(e);
	}

	if (errors.length > 0) {
		throw errors[0];
	}
}
