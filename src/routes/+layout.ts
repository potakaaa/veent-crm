import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url, data }) => {
	if (url.pathname === '/login') {
		return {
			currentUser: null,
			counts: { overdue: 0, unassigned: 0 },
			sidebarOpen: data.sidebarOpen
		};
	}

	const currentUser = data.user ? { ...data.user, active: true as const } : null;

	return { currentUser, counts: data.counts, sidebarOpen: data.sidebarOpen };
};
