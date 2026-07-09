import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getFollowUpsInRange, listActiveReps, getLeadOwners } from '$lib/server/db/leads';
import { getMeetingOwners } from '$lib/server/db/meetings';
import { computeRange, parseDateParam, toDateParam, type CalendarView } from '$lib/utils/calendar';
import type { CalendarEntry } from '$lib/types';
import { fetchCalendarReport } from '$lib/caldav/reader';
import { parseIcsToEvents } from '$lib/caldav/parser';
import { classifyCalDavEvents, filterByOwnership } from '$lib/caldav/classify';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const view: CalendarView = url.searchParams.get('view') === 'week' ? 'week' : 'month';
	const anchor = parseDateParam(url.searchParams.get('date'));
	const { start, end } = computeRange(view, anchor);

	const { id, role } = locals.user;
	const isManager = role === 'manager' || role === 'super_manager';

	// CAL-3 (GitHub #208) trust boundary: the rep filter is manager-only. A rep who hand-crafts
	// `?repId=<other-uuid>` is ignored here (filterRepId dropped for reps) AND ignored in-function
	// (the query composers only honor filterRepId for non-rep roles). `filterRepId` may legitimately
	// equal the manager's OWN UUID — that is the "Mine" view a manager gets by selecting themselves.
	// UUID guard: reject malformed repId values before they reach eq(ownerId, ...) — PostgreSQL
	// throws on non-UUID input to a uuid column, causing a 500 for the caller.
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const rawRepId = isManager ? url.searchParams.get('repId') : null;
	const filterRepId = rawRepId && UUID_RE.test(rawRepId) ? rawRepId : undefined;

	// NCAL-5: CalDAV is the single source of truth for meetings, go-live dates, and event starts.
	// DB queries now only provide follow-ups (owner-scoped) and active reps (for the filter UI).
	const [followUps, activeReps] = await Promise.all([
		getFollowUpsInRange(id, start, end, role, filterRepId),
		isManager ? listActiveReps() : Promise.resolve([])
	]);

	const followUpEntries: CalendarEntry[] = followUps
		.filter((l): l is typeof l & { followUpAt: string } => !!l.followUpAt)
		.map((l) => ({
			id: `followup-${l.id}`,
			type: 'followup',
			startAt: l.followUpAt,
			title: l.name,
			subtitle: l.handle,
			href: `/leads/${l.id}`
		}));

	// CalDAV events — graceful degradation on error (AC17: degrade to [] on failure)
	let calDavEntries: CalendarEntry[] = [];
	try {
		const blobs = await fetchCalendarReport({ start, end });
		const allEvents = blobs.flatMap((blob) => parseIcsToEvents(blob, { start, end }));

		const classified = classifyCalDavEvents(allEvents);

		// Batch-fetch lead ownership (leadId → ownerId)
		const leadIds = [
			...new Set(
				classified
					.map((e) => {
						const m = e.href.match(/\/leads\/([^/?#]+)/);
						return m ? m[1] : null;
					})
					.filter((id): id is string => id !== null)
			)
		];
		const ownerMap = await getLeadOwners(leadIds);

		// Batch-fetch meeting ownership (meetingId → organizerUserId)
		const meetingIds = [
			...new Set(
				classified
					.map((e) => {
						const m = e.href.match(/\/meetings\/([^/?#]+)/);
						return m ? m[1] : null;
					})
					.filter((id): id is string => id !== null)
			)
		];
		const meetingOwnerMap = await getMeetingOwners(meetingIds);

		calDavEntries = filterByOwnership(classified, {
			userId: id,
			role,
			filterRepId,
			ownerMap,
			meetingOwnerMap
		});
	} catch {
		// Degrade gracefully — calendar still loads without Nextcloud events
	}

	const entries = [...followUpEntries, ...calDavEntries].sort(
		(a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
	);

	return {
		entries,
		view,
		date: toDateParam(anchor),
		activeReps,
		filterRepId: filterRepId ?? null,
		isManager,
		meId: id
	};
};
