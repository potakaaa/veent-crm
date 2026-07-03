import type { LayoutLoad } from './$types';

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch, data }) => {
	if (url.pathname === '/login') {
		return {
			currentUser: null,
			counts: { overdue: 0, unassigned: 0 },
			sidebarOpen: data.sidebarOpen
		};
	}

	// Use the server-resolved session user (real role from crm_users DB) so that
	// manager-gated UI elements show correctly. When there is no server session
	// (e.g. /unauthorized), render no identity rather than a fabricated one.
	const serverUser = data.user;
	const currentUser = serverUser ? { ...serverUser, active: true as const } : null;

	const countsRes = await fetch('/api/nav-counts');
	const counts: { overdue: number; unassigned: number } = countsRes.ok
		? await countsRes.json()
		: { overdue: 0, unassigned: 0 };

	// Forward the SSR-read sidebar collapse state from the parent server load. This client load
	// builds a fresh return object (does not spread ...data), so the field must be re-exposed
	// explicitly or it never reaches +layout.svelte. (VALIDATE fix P1.)
	return { currentUser, counts, sidebarOpen: data.sidebarOpen };
};
