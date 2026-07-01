<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon, { type IconName } from '$lib/components/shared/Icon.svelte';
	import { authClient } from '$lib/auth-client';
	import { roleLabel } from '$lib/utils/roles';
	import type { User } from '$lib/types';

	async function signOut() {
		await authClient.signOut();
		goto('/login');
	}

	let {
		user,
		counts
	}: {
		user: User | null;
		counts: { overdue: number; unassigned: number; review: number };
	} = $props();

	type NavItem = {
		href: string;
		label: string;
		icon: IconName;
		badge?: number;
		badgeColor?: string;
	};

	const work: NavItem[] = $derived([
		{
			href: '/',
			label: 'Today',
			icon: 'today',
			badge: counts.overdue || undefined,
			badgeColor: '#e11d48'
		},
		{ href: '/leads', label: 'My Leads', icon: 'leads' },
		{ href: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
		{
			href: '/unassigned',
			label: 'Up for grabs',
			icon: 'unassigned',
			badge: counts.unassigned || undefined
		},
		{ href: '/reminders', label: 'Reminders', icon: 'reminders' },
		{ href: '/meetings', label: 'Meetings', icon: 'calendar' }
	]);
	const manager: NavItem[] = $derived([
		{ href: '/reports', label: 'Reports', icon: 'reports' },
		{ href: '/team', label: 'Team', icon: 'team' },
		{
			href: '/review',
			label: 'Review queue',
			icon: 'review',
			badge: counts.review || undefined,
			badgeColor: '#e11d48'
		}
	]);

	const isActive = (href: string) => {
		const p = page.url.pathname;
		if (href === '/') return p === '/';
		if (href === '/leads') return p === '/leads' || p.startsWith('/leads/');
		return p.startsWith(href);
	};
</script>

{#snippet navButton(item: NavItem)}
	{@const active = isActive(item.href)}
	<a
		href={item.href}
		class="mb-0.5 flex h-[38px] items-center gap-[11px] rounded-control px-[11px] text-[13px] transition-colors {active
			? 'bg-[rgba(192,54,44,0.16)] font-semibold text-white shadow-[inset_3px_0_0_#c0362c]'
			: 'font-medium text-[#b89e9c] hover:bg-white/5'}"
	>
		<Icon name={item.icon} />
		<span class="flex-1 text-left">{item.label}</span>
		{#if item.badge}
			<span
				class="inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] font-mono text-[10px] font-semibold"
				style={item.badgeColor
					? `background:${item.badgeColor};color:#fff`
					: 'background:rgba(255,255,255,0.1);color:#b89e9c'}
			>
				{item.badge}
			</span>
		{/if}
	</a>
{/snippet}

<aside data-rail class="flex w-[224px] shrink-0 flex-col bg-ink text-white max-[880px]:hidden">
	<!-- brand -->
	<div class="flex items-center gap-2.5 border-b border-[#3a2122] px-[18px] pb-[14px] pt-[18px]">
		<div
			class="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-primary text-[15px] font-bold"
		>
			V
		</div>
		<div>
			<div class="text-[13.5px] font-bold tracking-[-0.2px]">Veent CRM</div>
			<div class="font-mono text-[9px] uppercase tracking-[1px] text-[#8a7270]">
				Outreach Console
			</div>
		</div>
	</div>

	<!-- nav -->
	<nav class="flex-1 overflow-y-auto px-3 py-[14px]">
		<div class="px-2 pb-2 font-mono text-[9.5px] uppercase tracking-[1.2px] text-[#7a6260]">
			Work
		</div>
		{#each work as item (item.href)}{@render navButton(item)}{/each}

		{#if user?.role === 'manager'}
			<div
				class="px-2 pb-2 pt-[18px] font-mono text-[9.5px] uppercase tracking-[1.2px] text-[#7a6260]"
			>
				Manager
			</div>
			{#each manager as item (item.href)}{@render navButton(item)}{/each}
		{/if}
	</nav>

	<!-- user footer -->
	<div class="flex items-center gap-2.5 border-t border-[#3a2122] px-[14px] py-3">
		<div
			class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold"
		>
			{user?.name?.[0] ?? '?'}
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-[12.5px] font-semibold">{user?.name ?? 'Signed out'}</div>
			<div class="font-mono text-[10px] text-[#8a7270]">
				{user?.role ? roleLabel(user.role) : '—'}{user?.location ? ` · ${user.location}` : ''}
			</div>
		</div>
		<button onclick={signOut} title="Sign out" class="p-1 text-[#8a7270] hover:text-white">
			<Icon name="logout" size={16} />
		</button>
	</div>
</aside>
