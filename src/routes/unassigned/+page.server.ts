import type { PageServerLoad } from './$types';
import {
	listUnassignedLeads,
	listUsers,
	getUnassignedLeadCountries,
	parseFilterCsv
} from '$lib/server/db/leads';
import { leadCategory } from '$lib/server/db/schema';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const UNASSIGNED_SORT_COLS_SET = new Set(['name', 'event', 'stage', 'source']);
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = UNASSIGNED_SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const dir = url.searchParams.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const);

	const country = parseFilterCsv(url.searchParams.get('country'));
	const rawCategory = parseFilterCsv(url.searchParams.get('category'));
	const validCategories = new Set<string>(leadCategory.enumValues);
	const category = rawCategory.filter((c) => validCategories.has(c));

	const [result, users, countryOptions] = await Promise.all([
		listUnassignedLeads(page, PAGE_SIZE, sort, dir, { country, category }),
		listUsers(),
		getUnassignedLeadCountries()
	]);

	return {
		leads: result.leads,
		users,
		sort: sort ?? '',
		dir,
		categoryOptions: [...leadCategory.enumValues],
		countryOptions,
		filters: { country, category },
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
