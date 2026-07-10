<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';
	import AppTopbar from './AppTopbar.svelte';
	import Toaster from '$lib/components/shared/Toaster.svelte';
	import type { User } from '$lib/types';

	let {
		user,
		counts,
		// SSR-read initial collapse state (from the `sidebar:state` cookie via +layout.server.ts →
		// +layout.ts). Passed as SidebarProvider's initial `open` so the rail paints in the last-set
		// state with no flash-of-wrong-state. Defaults to expanded.
		sidebarOpen = true,
		children
	}: {
		user: User | null;
		counts: { overdue: number; unassigned: number; unread: number };
		sidebarOpen?: boolean;
		children: Snippet;
	} = $props();

	// Mobile nav drawer open-state, lifted here so the hamburger in AppTopbar and the drawer
	// rendered inside AppSidebar (siblings) share one source of truth. Controlled-open only —
	// no Dialog.Trigger (repo convention). The mobile drawer is the hand-tuned bits-ui Dialog
	// (unchanged); the shadcn Sidebar's own Sheet mobile branch is intentionally NOT used
	// (fallback path — keeps mobile <880px pixel-identical, see AppSidebar).
	let mobileNavOpen = $state(false);
</script>

<!--
	SidebarProvider supplies the shadcn Sidebar context (collapse open-state, the built-in
	Cmd/Ctrl+B keyboard shortcut, and the cookie writer) to the desktop rail. `--sidebar-width`
	is overridden to 236px to keep the existing expanded rail width; `--sidebar-width-icon`
	(3rem) drives the collapsed icon rail. Extra classes restore the app-shell frame
	(full-height, clipped, dark nav bg) on top of the provider's `flex w-full` base.
-->
<Sidebar.Provider
	open={sidebarOpen}
	style="--sidebar-width: 236px; --sidebar-width-icon: 3.5rem;"
	class="h-screen overflow-hidden bg-nav-bg"
>
	<AppSidebar {user} {counts} bind:mobileOpen={mobileNavOpen} />
	<div class="flex min-w-0 flex-1 flex-col">
		<AppTopbar onMenuClick={() => (mobileNavOpen = true)} />
		<main
			class="min-h-0 flex-1 overflow-y-auto bg-canvas"
			style="background-image: radial-gradient(circle at 100% 0%, var(--color-nav-glow), transparent 26%);"
		>
			{@render children()}
		</main>
	</div>
</Sidebar.Provider>
<Toaster />
