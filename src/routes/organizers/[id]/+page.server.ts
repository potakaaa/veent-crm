import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	getOrganizer,
	listLinkedLeadsForOrganizer,
	DETAIL_SORT_COLS
} from '$lib/server/db/organizers';
import { LEAD_STAGES } from '$lib/zod/schemas';

const PAGE_SIZE = 25;
const SORT_COLS_SET = new Set<string>(DETAIL_SORT_COLS);
const VALID_STAGES = new Set<string>(LEAD_STAGES);

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const organizer = await getOrganizer(params.id);
	if (!organizer) throw error(404, 'Organizer not found');

	const search = url.searchParams.get('q') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const owner = url.searchParams.get('owner') ?? '';
	const rawStage = url.searchParams.get('stage') ?? '';
	const stage = VALID_STAGES.has(rawStage) ? rawStage : '';
	const rawSort = url.searchParams.get('sort') ?? '';
	const sort = SORT_COLS_SET.has(rawSort) ? rawSort : undefined;
	const rawDir = url.searchParams.get('dir');
	// Default: eventDate descending (most-recent event first, matching the prior ordering).
	const effectiveSort = sort ?? 'eventDate';
	const dir =
		rawDir === 'asc' ? ('asc' as const) : rawDir === 'desc' ? ('desc' as const) : ('desc' as const);
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const result = await listLinkedLeadsForOrganizer(organizer.id, locals.user.id, locals.user.role, {
		search: search || undefined,
		country: country || undefined,
		owner: owner || undefined,
		stage: stage || undefined,
		sort: effectiveSort,
		dir,
		page,
		pageSize: PAGE_SIZE
	});

	return {
		organizer,
		leads: result.leads,
		countries: result.countries,
		owners: result.owners,
		stages: LEAD_STAGES,
		filters: { search, country, owner, stage },
		sort: effectiveSort,
		dir,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
