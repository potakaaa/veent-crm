import type { LayoutServerLoad } from './$types';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	// Read the shadcn Sidebar collapse-state cookie server-side so the sidebar renders in the
	// last-set state on first paint (no flash-of-wrong-state). Cookie is written client-side by
	// SidebarProvider on toggle; value is the string "true"/"false". Default: expanded (true).
	const sidebarOpen = cookies.get(SIDEBAR_COOKIE_NAME) !== 'false';
	return { user: locals.user, sidebarOpen };
};
