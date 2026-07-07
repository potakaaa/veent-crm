import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeadsFiltered, listUsers, getLeadCountries } from '$lib/server/db/leads';
import { computeAppealScore, today } from '$lib/appeal-score';
import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
import type { LeadSegment, User } from '$lib/types';
import { isManagerRole } from '$lib/utils/permissions';

const PAGE_SIZE = 25;
const VALID_SEGMENTS = new Set(['mine', 'all', 'unassigned', 'lost']);
const VALID_STAGES = new Set<string>(LEAD_STAGES);
const VALID_PLATFORMS = new Set<string>(LEAD_PLATFORMS);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawSegment = url.searchParams.get('segment') ?? 'mine';
	const segment: LeadSegment = VALID_SEGMENTS.has(rawSegment)
		? (rawSegment as LeadSegment)
		: 'mine';
	const rawStage = url.searchParams.get('stage') ?? '';
	const stage = VALID_STAGES.has(rawStage) ? rawStage : '';
	const rawPlatform = url.searchParams.get('platform') ?? '';
	const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : '';
	const country = url.searchParams.get('country') ?? '';
	const rawOwner = url.searchParams.get('owner') ?? '';
	const staleOnly = url.searchParams.get('staleOnly') === '1';
	const hasFutureEvents = url.searchParams.get('hasFutureEvents') === '1';
	const search = url.searchParams.get('q') ?? '';
	const rawDate = url.searchParams.get('date') ?? '';
	const date = (() => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return '';
		const d = new Date(rawDate + 'T00:00:00Z');
		return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== rawDate ? '' : rawDate;
	})();
	const rawCreatedFrom = url.searchParams.get('createdFrom') ?? '';
	const createdFrom = (() => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(rawCreatedFrom)) return '';
		const d = new Date(rawCreatedFrom + 'T00:00:00Z');
		return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== rawCreatedFrom
			? ''
			: rawCreatedFrom;
	})();
	const rawDateField = url.searchParams.get('dateField') ?? '';
	const dateField: 'event_date' | 'created_at' =
		rawDateField === 'created_at' ? 'created_at' : 'event_date';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const LEADS_SORT_COLS_SET = new Set([
		'name',
		'event',
		'stage',
		'platform',
		'lastActivity',
		'appeal'
	]);
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = LEADS_SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const effectiveSort = sort ?? 'event';
	const rawDir = url.searchParams.get('dir');
	const dir =
		rawDir === 'asc'
			? ('asc' as const)
			: rawDir === 'desc'
				? ('desc' as const)
				: effectiveSort === 'event'
					? ('asc' as const)
					: ('desc' as const);

	const rawWeeksAhead = url.searchParams.get('weeksAhead') ?? '';
	const weeksAhead: number | null =
		rawWeeksAhead === 'all'
			? null
			: rawWeeksAhead === ''
				? 8
				: Math.max(1, parseInt(rawWeeksAhead, 10) || 8);

	// Owner filter (GitHub #226): manager/super_manager only, whitelisted against real user ids.
	// Reps already see only their own leads via segment scoping, so the control is a no-op for them.
	const users = await listUsers();
	const owner =
		isManagerRole(locals.user.role) && users.some((u) => u.id === rawOwner) ? rawOwner : '';

	const [result, countries] = await Promise.all([
		listLeadsFiltered({
			userId: locals.user.id,
			role: locals.user.role,
			segment,
			stage: stage || undefined,
			platform: platform || undefined,
			country: country || undefined,
			ownerId: owner || undefined,
			staleOnly,
			hasFutureEvents,
			search: search || undefined,
			date: date || undefined,
			dateField: date ? dateField : undefined,
			createdFrom: createdFrom || undefined,
			page,
			pageSize: PAGE_SIZE,
			sort,
			dir,
			weeksAhead
		}),
		getLeadCountries()
	]);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	// Attach derived Lead Appeal Score per row (never persisted). `now` is floored to the
	// UTC date boundary so the displayed badge matches the SQL `?sort=appeal` ORDER BY (E3).
	const now = today();
	const leads = result.leads.map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.firstAnnouncedDate, l.firstReachedOutDate, now)
	}));

	return {
		leads,
		total: result.total,
		countries,
		users,
		me,
		filters: {
			segment,
			stage,
			platform,
			country,
			owner,
			staleOnly,
			hasFutureEvents,
			search,
			date,
			dateField,
			createdFrom,
			weeksAhead
		},
		sort: sort ?? 'event',
		dir,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
