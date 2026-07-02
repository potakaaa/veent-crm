import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { meetingUpdateSchema } from '$lib/zod/schemas';
import { getMeeting, updateMeeting, softDeleteMeeting } from '$lib/server/db/meetings';
import { isManagerRole } from '$lib/utils/permissions';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const meeting = await getMeeting(params.id);
	if (!meeting) throw error(404, 'Meeting not found');
	if (!isManagerRole(locals.user.role) && meeting.organizerId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = meetingUpdateSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const { data } = parsed;
	const updated = await updateMeeting(params.id, {
		startAt: data.startAt !== undefined ? new Date(data.startAt) : undefined,
		organizerId: data.organizerId,
		meetingUrl: data.meetingUrl !== undefined ? data.meetingUrl || null : undefined,
		notes: data.notes,
		outcome: data.outcome,
		attendeeIds: data.attendeeIds
	});

	if (!updated) throw error(404, 'Meeting not found');
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const meeting = await getMeeting(params.id);
	if (!meeting) throw error(404, 'Meeting not found');
	if (!isManagerRole(locals.user.role) && meeting.organizerId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	const ok = await softDeleteMeeting(params.id);
	if (!ok) throw error(404, 'Meeting not found');
	return json({ ok: true });
};
