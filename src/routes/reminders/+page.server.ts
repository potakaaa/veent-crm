import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
	getRemindersQueue,
	getAllFollowUpsQueue,
	listActiveReps,
	enrichWithOwnerNames
} from '$lib/server/db/leads';
import { env } from '$env/dynamic/private';
import type { Lead } from '$lib/types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');

	const { id, role } = locals.user;
	const isManager = role === 'manager' || role === 'super_manager';

	// Rep-filter is manager-only. Never even pass a repId through for a rep session — the
	// query also ignores it for reps, but this keeps the trust boundary explicit at the route.
	const filterRepId = isManager ? (url.searchParams.get('repId') ?? undefined) : undefined;

	const [{ overdue, due, upcoming, cold }, allFollowUps, activeReps] = await Promise.all([
		getRemindersQueue(id, role),
		getAllFollowUpsQueue(id, role, filterRepId ? { filterRepId } : undefined),
		isManager ? listActiveReps() : Promise.resolve([])
	]);

	// Single batched owner-name enrichment across every lead surfaced on the page (both tabs).
	// Enrich the union once (one crmUsers query), then re-map each array by id so buckets and
	// the combined list all carry ownerName without redundant lookups.
	const enriched = await enrichWithOwnerNames([
		...overdue,
		...due,
		...upcoming,
		...cold,
		...allFollowUps
	]);
	const byId = new Map(enriched.map((l) => [l.id, l]));
	const withNames = (arr: Lead[]): Lead[] => arr.map((l) => byId.get(l.id) ?? l);

	// Nudge (no outbound messaging integration yet) — visible outside production only.
	const nudgeEnabled = env.ENVIRENOMENT !== 'production';

	return {
		overdue: withNames(overdue),
		due: withNames(due),
		upcoming: withNames(upcoming),
		cold: withNames(cold),
		allFollowUps: withNames(allFollowUps),
		activeReps,
		filterRepId: filterRepId ?? null,
		isManager,
		meId: id,
		nudgeEnabled
	};
};
