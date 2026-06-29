import type { LayoutLoad } from './$types';
import { crm } from '$lib/services';

// Universal load: works on server (SSR) and client. Sources the signed-in user,
// the roster, the full lead set (for the command-bar dedup search), and nav
// counts — all through the service interface, never raw mock arrays.
export const load: LayoutLoad = async () => {
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
