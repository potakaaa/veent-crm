import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { meetingFormSchema } from '$lib/zod/schemas';
import { listAllMeetings, createMeeting } from '$lib/server/db/meetings';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json(await listAllMeetings());
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = meetingFormSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const { data } = parsed;
	const meeting = await createMeeting({
		leadId: data.leadId,
		startAt: new Date(data.startAt),
		// Any authenticated user may create; organizer defaults to the creator.
		organizerId: data.organizerId ?? locals.user.id,
		meetingUrl: data.meetingUrl || undefined,
		notes: data.notes || undefined,
		outcome: data.outcome || undefined,
		attendeeIds: data.attendeeIds
	});

	return json(meeting, { status: 201 });
};
