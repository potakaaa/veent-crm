<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let { children, data } = $props();

	async function logout() {
		await authClient.signOut();
		goto('/login');
	}

	const nav = [
		{ href: '/', label: 'Today' },
		{ href: '/leads', label: 'Leads' },
		{ href: '/pipeline', label: 'Pipeline' },
		{ href: '/unassigned', label: 'Up for grabs' },
		{ href: '/reminders', label: 'Reminders' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/review', label: 'Review queue' },
		{ href: '/team', label: 'Team' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-gray-50 text-gray-900">
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
			<a href="/" class="font-semibold tracking-tight">Veent CRM</a>
			<span class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
				v0 · stub
			</span>
			<nav class="ml-4 flex flex-wrap gap-1 text-sm">
				{#each nav as item}
					<a
						href={item.href}
						class="rounded px-3 py-1.5 hover:bg-gray-100 {isActive(item.href)
							? 'bg-gray-900 text-white hover:bg-gray-900'
							: 'text-gray-600'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-3 text-sm text-gray-500">
				{#if data?.user}
					<span>{data.user.name} · {data.user.role}</span>
					<button onclick={logout} class="text-gray-400 hover:text-gray-700">Log out</button>
				{:else}
					<a href="/login" class="text-blue-600 hover:underline">Log in</a>
				{/if}
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-6">
		{@render children()}
	</main>
</div>
