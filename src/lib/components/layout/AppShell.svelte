<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from './AppSidebar.svelte';
	import AppTopbar from './AppTopbar.svelte';
	import Toaster from '$lib/components/shared/Toaster.svelte';
	import type { Lead, User } from '$lib/types';

	let {
		user,
		users,
		leads,
		counts,
		children
	}: {
		user: User | null;
		users: User[];
		leads: Lead[];
		counts: { overdue: number; unassigned: number; review: number };
		children: Snippet;
	} = $props();
</script>

<div class="flex h-screen overflow-hidden bg-panel-subtle">
	<AppSidebar {user} {counts} />
	<div class="flex min-w-0 flex-1 flex-col">
		<AppTopbar {leads} {users} reviewCount={counts.review} />
		<main class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</div>
<Toaster />
