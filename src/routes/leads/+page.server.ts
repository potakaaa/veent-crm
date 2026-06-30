import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeadsFiltered, listUsers, getLeadCountries } from '$lib/server/db/leads';
import type { LeadSegment, User } from '$lib/types';

const PAGE_SIZE = 25;
const VALID_SEGMENTS = new Set(['mine', 'all', 'unassigned', 'lost']);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawSegment = url.searchParams.get('segment') ?? 'mine';
	const segment: LeadSegment = VALID_SEGMENTS.has(rawSegment)
		? (rawSegment as LeadSegment)
		: 'mine';
	const stage = url.searchParams.get('stage') ?? '';
	const platform = url.searchParams.get('platform') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const staleOnly = url.searchParams.get('staleOnly') === '1';
	const search = url.searchParams.get('q') ?? '';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const [result, users, countries] = await Promise.all([
		listLeadsFiltered({
			userId: locals.user.id,
			segment,
			stage: stage || undefined,
			platform: platform || undefined,
			country: country || undefined,
			staleOnly,
			search: search || undefined,
			page,
			pageSize: PAGE_SIZE
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
		filters: { segment, stage, platform, country, staleOnly, search },
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
