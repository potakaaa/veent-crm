import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { meetingFormSchema } from '$lib/zod/schemas';
import {
	listMeetingsPaginated,
	createMeeting,
	parseMeetingFilterParams
} from '$lib/server/db/meetings';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '8', 10) || 8));
	// Trusted server-side meId (locals.user.id) — never client-provided.
	const filters = parseMeetingFilterParams(url.searchParams, locals.user.id);
	return json(await listMeetingsPaginated(page, limit, filters));
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
		// Lead's linked recurring-organizer (crm_organizers) — pre-filled from the lead, nullable.
		leadOrganizerId: data.leadOrganizerId ?? null,
		meetingUrl: data.meetingUrl || undefined,
		notes: data.notes || undefined,
		outcome: data.outcome || undefined,
		attendeeIds: data.attendeeIds
	});

	return json(meeting, { status: 201 });
};
