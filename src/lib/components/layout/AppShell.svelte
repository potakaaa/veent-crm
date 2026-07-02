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
</script>

<div class="flex h-screen overflow-hidden bg-[#1a171c]">
	<AppSidebar {user} {counts} />
	<div class="flex min-w-0 flex-1 flex-col">
		<AppTopbar />
		<main
			class="min-h-0 flex-1 overflow-y-auto bg-canvas"
			style="background-image: radial-gradient(circle at 100% 0%, rgba(225,29,42,0.05), transparent 26%);"
		>
			{@render children()}
		</main>
	</div>
</div>
<Toaster />
