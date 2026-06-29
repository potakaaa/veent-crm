import type { LayoutLoad } from './$types';
import { crm } from '$lib/services';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
	if (url.pathname === '/login') {
		return {
			currentUser: null,
			users: [],
			leads: [],
			counts: { overdue: 0, unassigned: 0, review: 0 }
		};
	}

	const [currentUser, users, leads, mine, unassigned, review] = await Promise.all([
		crm.getCurrentUser(),
		crm.listUsers(),
		crm.listLeads({ segment: 'all', includeLost: true }),
		crm.listLeads({ segment: 'mine' }),
		crm.listLeads({ segment: 'unassigned' }),
		crm.listReviewItems()
	]);

	return {
		currentUser,
		users,
		leads,
		counts: {
			overdue: mine.filter((l) => l.urgency === 'overdue').length,
			unassigned: unassigned.length,
			review: review.length
		}
	};
};
