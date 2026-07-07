import type { PageServerLoad } from './$types';
import {
	listUnassignedLeads,
	listUsers,
	getUnassignedLeadCountries,
	parseFilterCsv
} from '$lib/server/db/leads';
import { getActiveCategories, getCategoriesForLeads } from '$lib/server/db/categories';
import { computeAppealScore, today } from '$lib/appeal-score';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const UNASSIGNED_SORT_COLS_SET = new Set(['name', 'event', 'stage', 'source', 'appeal']);
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = UNASSIGNED_SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const rawDir = url.searchParams.get('dir');
	const effectiveSort = sort ?? 'event';
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

	const country = parseFilterCsv(url.searchParams.get('country'));
	const categoryIds = parseFilterCsv(url.searchParams.get('categoryIds'));

	const search = url.searchParams.get('q')?.trim() || undefined;

	const [result, users, countryOptions, allCategories] = await Promise.all([
		listUnassignedLeads(page, PAGE_SIZE, sort, dir, { country, categoryIds, weeksAhead, search }),
		listUsers(),
		getUnassignedLeadCountries(),
		getActiveCategories()
	]);

	// Attach derived Lead Appeal Score per row (never persisted); `now` floored to date (E3).
	const now = today();
	const categoriesByLead = await getCategoriesForLeads(result.leads.map((l) => l.id));
	const leads = result.leads.map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.firstAnnouncedDate, l.firstReachedOutDate, now),
		categories: categoriesByLead.get(l.id) ?? []
	}));

	return {
		leads,
		users,
		sort: sort ?? 'event',
		dir,
		allCategories,
		countryOptions,
		filters: { country, categoryIds, weeksAhead, search: search ?? '' },
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
