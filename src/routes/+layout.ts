import type { LayoutLoad } from './$types';
import { crm } from '$lib/services';

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch }) => {
	if (url.pathname === '/login') {
		return {
			currentUser: null,
			users: [],
			leads: [],
			counts: { overdue: 0, unassigned: 0, review: 0 }
		};
	}

	const [currentUser, users, leads, countsRes] = await Promise.all([
		crm.getCurrentUser(),
		crm.listUsers(),
		crm.listLeads({ segment: 'all', includeLost: true }),
		fetch('/api/nav-counts')
	]);

	const counts: { overdue: number; unassigned: number; review: number } = countsRes.ok
		? await countsRes.json()
		: { overdue: 0, unassigned: 0, review: 0 };

	return { currentUser, users, leads, counts };
};
