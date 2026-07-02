<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from './AppSidebar.svelte';
	import AppTopbar from './AppTopbar.svelte';
	import Toaster from '$lib/components/shared/Toaster.svelte';
	import type { User } from '$lib/types';

	let {
		user,
		counts,
		children
	}: {
		user: User | null;
		counts: { overdue: number; unassigned: number };
		children: Snippet;
	} = $props();

	// Mobile nav drawer open-state, lifted here so the hamburger in AppTopbar and the drawer
	// rendered inside AppSidebar (siblings) share one source of truth. Controlled-open only —
	// no Dialog.Trigger (repo convention).
	let mobileNavOpen = $state(false);
</script>

<div class="flex h-screen overflow-hidden bg-nav-bg">
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
</div>
<Toaster />
