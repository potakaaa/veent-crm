<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';

	let { children, data } = $props();

	// Chrome-less routes: login, unauthorized (exact or sub-path), and error pages.
	const bare = $derived(
		page.url.pathname === '/login' ||
			page.url.pathname === '/unauthorized' ||
			page.url.pathname.startsWith('/unauthorized/') ||
			!!page.error
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if bare}
	{@render children()}
{:else}
	<AppShell user={data.currentUser} users={data.users} leads={data.leads} counts={data.counts}>
		{@render children()}
	</AppShell>
{/if}
