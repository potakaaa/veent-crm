import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	listOrganizersFiltered,
	getOrganizerCountries,
	ORGANIZERS_SORT_COLS
} from '$lib/server/db/organizers';

const PAGE_SIZE = 25;
const SORT_COLS_SET = new Set<string>(ORGANIZERS_SORT_COLS);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const search = url.searchParams.get('q') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const rawDir = url.searchParams.get('dir');
	const dir = rawDir === 'desc' ? ('desc' as const) : ('asc' as const);
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const [result, countries] = await Promise.all([
		listOrganizersFiltered(locals.user.id, locals.user.role, {
			search: search || undefined,
			country: country || undefined,
			sort,
			dir,
			page,
			pageSize: PAGE_SIZE
		}),
		getOrganizerCountries()
	]);

	return {
		organizers: result.organizers,
		countries,
		filters: { search, country },
		sort: sort ?? 'name',
		dir,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
