/**
 * POST /api/calendar/events/[uid]/link — session-gated.
 *
 * Links a Nextcloud team event to a CRM lead by:
 *   1. Validating session + body (leadId UUID + startAt ISO datetime)
 *   2. Inserting a crm_meetings row via createMeeting()
 *   3. Patching Nextcloud directly via directPatchEvent() (bypasses n8n — n8n drops CATEGORIES)
 *   4. On CalDAV failure: rolls back by calling softDeleteMeeting(meetingId)
 *   5. On success: records the Nextcloud UID via updateMeetingNextcloudUid()
 *
 * OQ3 resolution: if CalDAV PUT fails after DB insert → soft-delete the meeting row, return 502.
 * OQ2 resolution: organizerId is null — link-to-lead does NOT pre-fill organizerId.
 * UID source: params.uid (server path param) — never from request body.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	createMeeting,
	softDeleteMeeting,
	updateMeetingNextcloudUid
} from '$lib/server/db/meetings';
import { directPatchEvent, CalDavWebhookError } from '$lib/caldav/writer';

const linkBodySchema = z.object({
	leadId: z.string().uuid(),
	startAt: z.iso.datetime()
});

export const POST: RequestHandler = async ({ locals, request, params }) => {
	// Session gate FIRST
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = linkBodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const { leadId, startAt } = parsed.data;
	const uid = params.uid; // server-extracted path param — never from body
	if (!/^[\w.\-@]+$/.test(uid)) throw error(400, 'Invalid event UID');

	// Step 1: Insert crm_meetings row
	let meeting: Awaited<ReturnType<typeof createMeeting>>;
	try {
		meeting = await createMeeting({
			leadId,
			startAt: new Date(startAt),
			organizerId: null // OQ2: link to lead only; organizer pre-fill deferred
		});
	} catch {
		throw error(500, 'Failed to create meeting record');
	}

	// Step 2: Patch Nextcloud directly via CalDAV GET → mutate → PUT (bypasses n8n)
	try {
		await directPatchEvent(uid, {
			categories: 'crm-meeting',
			leadHref: `/leads/${leadId}`
		});
	} catch (e) {
		// OQ3: CalDAV failed → roll back the DB insert before returning error
		await softDeleteMeeting(meeting.id).catch(() => {
			console.error('[link/+server] softDeleteMeeting rollback failed for meeting', meeting.id);
		});
		if (e instanceof CalDavWebhookError && e.upstreamStatus === 404) {
			throw error(404, 'Calendar event not found');
		}
		throw error(502, 'Calendar service unavailable');
	}

	// Step 3: Record the Nextcloud UID on the meeting row (non-fatal if it fails)
	await updateMeetingNextcloudUid(meeting.id, uid).catch(() => {
		console.error('[link/+server] updateMeetingNextcloudUid failed for meeting', meeting.id);
	});

	return json({ success: true, meetingId: meeting.id });
};
