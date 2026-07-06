import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	getFollowUpsInRange,
	getGoLiveDatesInRange,
	getEventDatesInRange,
	isWithinRange
} from '$lib/server/db/leads';
import { listAllMeetings } from '$lib/server/db/meetings';
import { computeRange, parseDateParam, toDateParam, type CalendarView } from '$lib/utils/calendar';
import type { CalendarEntry } from '$lib/types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const view: CalendarView = url.searchParams.get('view') === 'week' ? 'week' : 'month';
	const anchor = parseDateParam(url.searchParams.get('date'));
	const { start, end } = computeRange(view, anchor);

	// Meetings are team-shared (no owner/organizer scoping — AC2); follow-ups are
	// owner-scoped to the signed-in user (AC3, enforced inside getFollowUpsInRange).
	//
	// Step-10 decision (recorded in phase report): range-filter meetings POST-fetch via the
	// shared `isWithinRange` helper rather than adding a param to listAllMeetings(). This keeps
	// the merged meetings module untouched (zero regression surface for /meetings), is backward
	// compatible, and is adequate for v0's small dataset. Server-side param filtering remains a
	// future optimization if the meeting volume grows.
	const [followUps, meetings, goLives, eventStarts] = await Promise.all([
		getFollowUpsInRange(locals.user.id, start, end),
		listAllMeetings(),
		getGoLiveDatesInRange(start, end, locals.user.id, locals.user.role),
		getEventDatesInRange(start, end, locals.user.id, locals.user.role)
	]);

	const meetingEntries: CalendarEntry[] = meetings
		.filter((m) => isWithinRange(m.startAt, start, end))
		.map((m) => ({
			id: `meeting-${m.id}`,
			type: 'meeting',
			startAt: m.startAt,
			title: m.leadName ?? 'Meeting',
			subtitle: m.organizerName ?? 'Unassigned',
			href: `/meetings/${m.id}`
		}));

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

	const goLiveEntries: CalendarEntry[] = goLives.map((l) => ({
		id: `golive-${l.id}`,
		type: 'golive',
		startAt: l.goLiveIso,
		title: l.name,
		href: `/leads/${l.id}`
	}));

	const eventStartEntries: CalendarEntry[] = eventStarts.map((l) => ({
		id: `eventstart-${l.id}`,
		type: 'eventstart',
		startAt: l.eventStartIso,
		title: l.name,
		href: `/leads/${l.id}`
	}));

	const entries = [
		...meetingEntries,
		...followUpEntries,
		...goLiveEntries,
		...eventStartEntries
	].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

	return { entries, view, date: toDateParam(anchor) };
};
