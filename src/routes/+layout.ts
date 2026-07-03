import type { LayoutLoad } from './$types';
import { crm } from '$lib/services';

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch, data }) => {
	if (url.pathname === '/login') {
		return {
			currentUser: null,
			users: [],
			leads: [],
			counts: { overdue: 0, unassigned: 0 },
			sidebarOpen: data.sidebarOpen
		};
	}

	// Use the server-resolved session user (real role from crm_users DB) so that
	// manager-gated UI elements show correctly regardless of mock data defaults.
	const serverUser = data.user;
	const currentUser = serverUser
		? { ...serverUser, active: true as const }
		: await crm.getCurrentUser();

	const [users, leads, countsRes] = await Promise.all([
		crm.listUsers(),
		crm.listLeads({ segment: 'all', includeLost: true }),
		fetch('/api/nav-counts')
	]);

	const counts: { overdue: number; unassigned: number } = countsRes.ok
		? await countsRes.json()
		: { overdue: 0, unassigned: 0 };

	// Forward the SSR-read sidebar collapse state from the parent server load. This client load
	// builds a fresh return object (does not spread ...data), so the field must be re-exposed
	// explicitly or it never reaches +layout.svelte. (VALIDATE fix P1.)
	return { currentUser, users, leads, counts, sidebarOpen: data.sidebarOpen };
};
