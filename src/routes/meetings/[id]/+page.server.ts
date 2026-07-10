import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getMeeting, getMeetingDetail } from '$lib/server/db/meetings';
import { listUsers } from '$lib/server/db/leads';
import type { User } from '$lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, locals }) => {
	// E2 (validate-contract): mirror /leads/[id]'s explicit guard for convention
	// consistency + typed narrowing of locals.user, even though the global session
	// hook already blocks unauthenticated access to /meetings/*.
	if (!locals.user) throw error(401, 'Unauthorized');

	// Same shape guard as /api/leads/[id]/claim — a malformed id would otherwise reach
	// the `uuid` column comparison in getMeetingDetail() and crash with a raw Postgres error.
	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid meeting ID');

	const [meeting, meetingMeta, users] = await Promise.all([
		getMeetingDetail(params.id),
		getMeeting(params.id),
		listUsers()
	]);

	// 404 (not a crash) for a missing or soft-deleted meeting — meetings-detail-route-404-on-missing.
	if (!meeting) throw error(404, 'Meeting not found');

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		firstName: locals.user.firstName,
		lastName: locals.user.lastName,
		role: locals.user.role,
		active: true
	};

	return { meeting, synced: !!meetingMeta?.nextcloudUid, users, me };
};
