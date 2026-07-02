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
		counts: { overdue: number; unassigned: number };
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
			badgeColor: '#e11d2a'
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
		{ href: '/calendar', label: 'Calendar', icon: 'calendarDays' },
		{ href: '/meetings', label: 'Meetings', icon: 'calendar' }
	]);
	const manager: NavItem[] = $derived([
		{ href: '/reports', label: 'Reports', icon: 'reports' },
		{ href: '/team', label: 'Team', icon: 'team' },
		{ href: '/templates', label: 'Templates', icon: 'reply' }
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
			? 'bg-[rgba(225,29,42,0.14)] font-semibold text-[#fca5a0] shadow-[inset_3px_0_0_#e11d2a]'
			: 'font-medium text-[#a8a1ab] hover:bg-white/5'}"
	>
		<Icon name={item.icon} />
		<span class="flex-1 text-left">{item.label}</span>
		{#if item.badge}
			<span
				class="inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] font-mono text-[10px] font-semibold"
				style={item.badgeColor
					? `background:${item.badgeColor};color:#fff`
					: 'background:rgba(255,255,255,0.1);color:#a8a1ab'}
			>
				{item.badge}
			</span>
		{/if}
	</a>
{/snippet}

<aside
	data-rail
	class="flex w-[236px] shrink-0 flex-col bg-[#1a171c] text-[#f5f3f4] max-[880px]:hidden"
>
	<!-- brand -->
	<div class="flex items-center gap-[11px] px-4 pb-[14px] pt-4">
		<div
			class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary text-[17px] font-extrabold shadow-[0_4px_12px_rgba(225,29,42,0.4)]"
		>
			V
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-[14px] font-extrabold tracking-[-0.3px]">Veent CRM</div>
			<div class="font-mono text-[8px] uppercase tracking-[1.6px] text-[#8a828f]">
				Outreach Console
			</div>
		</div>
		<span class="h-[7px] w-[7px] rounded-full bg-[#22c55e] shadow-[0_0_0_3px_rgba(34,197,94,0.18)]"
		></span>
	</div>

	<!-- nav -->
	<nav class="flex-1 overflow-y-auto px-3 py-1">
		<div
			class="px-2.5 pb-[7px] pt-2 font-mono text-[9.5px] uppercase tracking-[1.4px] text-[#6f6873]"
		>
			Workspace
		</div>
		{#each work as item (item.href)}{@render navButton(item)}{/each}

		{#if user?.role === 'manager' || user?.role === 'super_manager'}
			<div
				class="px-2.5 pb-[7px] pt-[18px] font-mono text-[9.5px] uppercase tracking-[1.4px] text-[#6f6873]"
			>
				Manager
			</div>
			{#each manager as item (item.href)}{@render navButton(item)}{/each}
		{/if}
	</nav>

	<!-- user footer -->
	<div class="flex items-center gap-2.5 border-t border-[#26222b] px-[14px] py-[11px]">
		<div class="relative shrink-0">
			<div
				class="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-[12px] font-semibold"
			>
				{user?.name?.[0] ?? '?'}
			</div>
			<span
				class="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full border-2 border-[#1a171c] bg-[#22c55e]"
			></span>
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-[12.5px] font-semibold">{user?.name ?? 'Signed out'}</div>
			<div class="font-mono text-[9.5px] text-[#8a828f]">
				{user?.role ? roleLabel(user.role) : '—'}{user?.location ? ` · ${user.location}` : ''}
			</div>
		</div>
		<button onclick={signOut} title="Sign out" class="p-1 text-[#8a828f] hover:text-white">
			<Icon name="logout" size={16} />
		</button>
	</div>
</aside>
