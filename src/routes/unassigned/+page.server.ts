import type { PageServerLoad } from './$types';
import { listUnassignedLeads, listUsers } from '$lib/server/db/leads';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const [result, users] = await Promise.all([listUnassignedLeads(page, PAGE_SIZE), listUsers()]);

	return {
		leads: result.leads,
		users,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			total: result.total,
			totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
		}
	};
};
