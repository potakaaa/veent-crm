import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeadsFiltered, listUsers, getLeadCountries } from '$lib/server/db/leads';
import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
import type { LeadSegment, User } from '$lib/types';

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
	const staleOnly = url.searchParams.get('staleOnly') === '1';
	const hasFutureEvents = url.searchParams.get('hasFutureEvents') === '1';
	const search = url.searchParams.get('q') ?? '';
	const rawDate = url.searchParams.get('date') ?? '';
	const date = (() => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return '';
		const d = new Date(rawDate + 'T00:00:00Z');
		return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== rawDate ? '' : rawDate;
	})();
	const rawDateField = url.searchParams.get('dateField') ?? '';
	const dateField: 'event_date' | 'created_at' =
		rawDateField === 'created_at' ? 'created_at' : 'event_date';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const LEADS_SORT_COLS_SET = new Set(['name', 'event', 'stage', 'platform', 'lastActivity']);
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = LEADS_SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const dir = url.searchParams.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const);

	const [result, users, countries] = await Promise.all([
		listLeadsFiltered({
			userId: locals.user.id,
			role: locals.user.role,
			segment,
			stage: stage || undefined,
			platform: platform || undefined,
			country: country || undefined,
			staleOnly,
			hasFutureEvents,
			search: search || undefined,
			date: date || undefined,
			dateField: date ? dateField : undefined,
			page,
			pageSize: PAGE_SIZE,
			sort,
			dir
		}),
		listUsers(),
		getLeadCountries()
	]);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return {
		leads: result.leads,
		total: result.total,
		countries,
		users,
		me,
		filters: {
			segment,
			stage,
			platform,
			country,
			staleOnly,
			hasFutureEvents,
			search,
			date,
			dateField
		},
		sort: sort ?? 'lastActivity',
		dir,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
