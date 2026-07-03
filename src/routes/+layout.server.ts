import type { LayoutServerLoad } from './$types';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants';
import { getNavCounts } from '$lib/server/db/leads';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const sidebarOpen = cookies.get(SIDEBAR_COOKIE_NAME) !== 'false';
	const counts = locals.user
		? await getNavCounts(locals.user.id, locals.user.role)
		: { overdue: 0, unassigned: 0 };
	return { user: locals.user, sidebarOpen, counts };
};
