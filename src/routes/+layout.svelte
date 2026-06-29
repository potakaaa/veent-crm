<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';

	let { children, data } = $props();

	// The login screen is full-bleed and chrome-less; everything else gets the app shell.
	const bare = $derived(page.url.pathname === '/login');
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if bare}
	{@render children()}
{:else}
	<AppShell user={data.currentUser} users={data.users} leads={data.leads} counts={data.counts}>
		{@render children()}
	</AppShell>
{/if}
