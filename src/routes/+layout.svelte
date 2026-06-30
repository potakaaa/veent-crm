<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page, navigating } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import RouteShells from '$lib/components/shared/skeletons/RouteShells.svelte';

	let { children, data } = $props();

	// Chrome-less routes: login, unauthorized (exact or sub-path), and error pages.
	const bare = $derived(
		page.url.pathname === '/login' ||
			page.url.pathname === '/unauthorized' ||
			page.url.pathname.startsWith('/unauthorized/') ||
			!!page.error
	);

	// Cross-route navigation only. A same-route filter/pagination change keeps the
	// pathname equal, so those are excluded (per-page navLoading handles them).
	const isRouteChange = $derived(
		navigating.to !== null && navigating.to.url.pathname !== page.url.pathname
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- Global navigation progress bar: shows only during a real navigation. It is an
     overlay strip and never covers/hides already-rendered content. -->
{#if navigating.to}
	<div
		class="bg-primary animate-pulse fixed left-0 right-0 top-0 z-50 h-0.5"
		role="progressbar"
		aria-label="Loading page"
		data-testid="nav-progress"
	></div>
{/if}

{#if bare}
	{@render children()}
{:else}
	<AppShell user={data.currentUser} users={data.users} leads={data.leads} counts={data.counts}>
		{#if isRouteChange && navigating.to}
			<RouteShells pathname={navigating.to.url.pathname} />
		{:else}
			{@render children()}
		{/if}
	</AppShell>
{/if}
