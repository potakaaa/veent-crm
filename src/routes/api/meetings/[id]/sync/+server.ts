import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMeeting, getMeetingDetail } from '$lib/server/db/meetings';
import { syncMeetingToNextcloud } from '$lib/server/n8n/calendar-sync';
import { isManagerRole } from '$lib/utils/permissions';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Fetch auth-guard data (organizerId + nextcloudUid) — mirrors PATCH/DELETE guard.
	const guard = await getMeeting(params.id);
	if (!guard) throw error(404, 'Meeting not found');

	// Replicate the exact organizer-ownership guard from PATCH/DELETE.
	if (!isManagerRole(locals.user.role) && guard.organizerId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Fetch full meeting detail for payload fields (venue, notes, startAt, leadId).
	// getMeetingDetail returns Meeting which does not carry nextcloudUid; use guard.nextcloudUid.
	const meeting = await getMeetingDetail(params.id);
	if (!meeting) throw error(404, 'Meeting not found');

	try {
		const uid = await syncMeetingToNextcloud({
			id: meeting.id,
			leadId: meeting.leadId ?? null,
			startAt: meeting.startAt,
			venue: meeting.venue ?? null,
			notes: meeting.notes ?? null,
			nextcloudUid: guard.nextcloudUid ?? null
		});
		return json({ success: true, uid });
	} catch (e) {
		console.error('[NCAL-3] manual meeting sync failed:', e);
		return json({ success: false, error: 'Calendar sync failed' }, { status: 502 });
	}
};
