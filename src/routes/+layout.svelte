<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page, navigating } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import RouteShells from '$lib/components/shared/skeletons/RouteShells.svelte';

	let { children, data } = $props();

	// Chrome-less routes: login, unauthorized (exact or sub-path), and error pages.
	// Use destination pathname during in-flight navigation so the shell doesn't flash
	// on navigations TO bare routes (e.g. redirect to /login after session expiry).
	const targetPath = $derived(navigating.to?.url.pathname ?? page.url.pathname);
	const bare = $derived(
		targetPath === '/login' ||
			targetPath === '/unauthorized' ||
			targetPath.startsWith('/unauthorized/') ||
			!!page.error
	);

	// Cross-route navigation only. A same-route filter/pagination change keeps the
	// pathname equal, so those are excluded (per-page navLoading handles them).
	const isRouteChange = $derived(
		navigating.to !== null && navigating.to.url.pathname !== page.url.pathname
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- Global navigation progress bar: shows only during a cross-route navigation.
     Same-route filter/pagination changes use per-page navLoading instead. -->
{#if isRouteChange}
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
