<script lang="ts">
	import { page, navigating } from '$app/state';
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import Icon, { type IconName } from '$lib/components/shared/Icon.svelte';
	import { authClient } from '$lib/auth-client';
	import { roleLabel } from '$lib/utils/roles';
	import { isManagerRole } from '$lib/utils/permissions';
	import type { User } from '$lib/types';

	async function signOut() {
		await authClient.signOut();
		goto('/login');
	}

	let {
		user,
		counts,
		// Controlled-open state for the mobile nav drawer, owned by AppShell (repo convention:
		// local state bound to `open`, no Dialog.Trigger). The desktop <aside> is unaffected.
		mobileOpen = $bindable(false)
	}: {
		user: User | null;
		counts: { overdue: number; unassigned: number };
		mobileOpen?: boolean;
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
			badgeColor: 'var(--color-nav-badge)'
		},
		{ href: '/leads', label: 'My Leads', icon: 'leads' },
		{ href: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
		{ href: '/organizers', label: 'Organizers', icon: 'organizers' },
		{
			href: '/unassigned',
			label: 'Up for grabs',
			icon: 'unassigned',
			badge: counts.unassigned || undefined
		},
		{ href: '/reminders', label: 'Reminders', icon: 'reminders' },
		{ href: '/calendar', label: 'Calendar', icon: 'calendarDays' },
		{ href: '/meetings', label: 'Meetings', icon: 'calendar' },
		{ href: '/templates', label: 'Templates', icon: 'reply' }
	]);
	const manager: NavItem[] = $derived([
		{ href: '/dashboard', label: 'Dashboard', icon: 'reports' },
		{ href: '/reports', label: 'Reports', icon: 'reports' },
		{ href: '/team', label: 'Team', icon: 'team' }
	]);

	const isActive = (href: string) => {
		const p = navigating.to?.url.pathname ?? page.url.pathname;
		if (href === '/') return p === '/';
		if (href === '/leads') return p === '/leads' || p.startsWith('/leads/');
		if (href === '/organizers') return p === '/organizers' || p.startsWith('/organizers/');
		return p.startsWith(href);
	};
</script>

{#snippet navButton(item: NavItem, onNavigate?: () => void)}
	{@const active = isActive(item.href)}
	<a
		href={item.href}
		onclick={onNavigate}
		aria-current={active ? 'page' : undefined}
		class="focus-ring mb-0.5 flex h-[38px] items-center gap-[11px] rounded-control px-[11px] text-[13px] transition-colors {active
			? 'bg-nav-active-bg font-semibold text-nav-active-fg shadow-nav-active'
			: 'font-medium text-nav-muted hover:bg-white/5'}"
	>
		<Icon name={item.icon} />
		<span class="flex-1 text-left">{item.label}</span>
		{#if item.badge}
			<span
				class="inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] font-mono text-[10px] font-semibold"
				style={item.badgeColor
					? `background:${item.badgeColor};color:var(--color-primary-foreground)`
					: 'background:var(--color-nav-badge-fallback);color:var(--color-nav-muted)'}
			>
				{item.badge}
			</span>
		{/if}
	</a>
{/snippet}

<!--
	Shared rail body — rendered once in the desktop <aside> and again inside the mobile drawer.
	`onNavigate` (when provided by the drawer) closes the drawer on destination select + sign-out;
	it is undefined for the always-visible desktop rail. Reuses the same work[]/manager[] arrays —
	no new nav destinations.
-->
{#snippet railBody(onNavigate?: () => void)}
	<!-- brand -->
	<div class="flex items-center gap-[11px] px-4 pb-[14px] pt-4">
		<div
			class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary text-[17px] font-extrabold shadow-nav-brand"
		>
			V
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-[14px] font-extrabold tracking-[-0.3px]">Veent CRM</div>
			<div class="font-mono text-[8px] uppercase tracking-[1.6px] text-nav-faint">
				Outreach Console
			</div>
		</div>
		<span class="h-[7px] w-[7px] rounded-full bg-nav-presence shadow-nav-presence"></span>
	</div>

	<!-- nav -->
	<nav class="flex-1 overflow-y-auto px-3 py-1">
		<div
			class="px-2.5 pb-[7px] pt-2 font-mono text-[9.5px] uppercase tracking-[1.4px] text-nav-section"
		>
			Workspace
		</div>
		{#each work as item (item.href)}{@render navButton(item, onNavigate)}{/each}

		{#if isManagerRole(user?.role)}
			<div
				class="px-2.5 pb-[7px] pt-[18px] font-mono text-[9.5px] uppercase tracking-[1.4px] text-nav-section"
			>
				Manager
			</div>
			{#each manager as item (item.href)}{@render navButton(item, onNavigate)}{/each}
		{/if}
	</nav>

	<!-- user footer -->
	<div class="flex items-center gap-2.5 border-t border-nav-border px-[14px] py-[11px]">
		<div class="relative shrink-0">
			<div
				class="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-[12px] font-semibold"
			>
				{user?.name?.[0] ?? '?'}
			</div>
			<span
				class="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full border-2 border-nav-bg bg-nav-presence"
			></span>
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-[12.5px] font-semibold">{user?.name ?? 'Signed out'}</div>
			<div class="font-mono text-[9.5px] text-nav-faint">
				{user?.role ? roleLabel(user.role) : '—'}{user?.location ? ` · ${user.location}` : ''}
			</div>
		</div>
		<button
			onclick={() => {
				onNavigate?.();
				signOut();
			}}
			title="Sign out"
			aria-label="Sign out"
			class="focus-ring rounded-control p-1 text-nav-faint hover:text-white"
		>
			<Icon name="logout" size={16} />
		</button>
	</div>
{/snippet}

<!--
	Desktop nav link rendered inside a shadcn SidebarMenuButton so it inherits the built-in
	icon-collapse behavior and the collapsed-state hover tooltip (AC3) for free, while keeping the
	existing hand-tuned link visuals (active left-accent bar, badge pill, nav tokens) — shadcn's
	default button styling is intentionally dropped (the explicit `class` overrides the merged
	variant class from `props`). On collapse the label + badge pill hide and a small dot indicator
	surfaces on the icon for items that carry a count.
-->
{#snippet deskNav(item: NavItem)}
	{@const active = isActive(item.href)}
	<Sidebar.MenuItem>
		<Sidebar.MenuButton isActive={active} tooltipContent={item.label}>
			{#snippet child({ props })}
				<!-- Drop shadcn's merged variant `class` (keep data-*/tooltip-trigger handlers) so the
				     hand-tuned link visuals below are authoritative regardless of class-merge behavior. -->
				<a
					href={item.href}
					{...{ ...props, class: undefined }}
					aria-current={active ? 'page' : undefined}
					class="focus-ring relative mb-0.5 flex h-[38px] items-center gap-[11px] rounded-control px-[11px] text-[13px] transition-colors group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>svg]:size-[22px] {active
						? 'bg-nav-active-bg font-semibold text-nav-active-fg shadow-nav-active'
						: 'font-medium text-nav-muted hover:bg-white/5'}"
				>
					<Icon name={item.icon} />
					<span class="flex-1 text-left group-data-[collapsible=icon]:hidden">{item.label}</span>
					{#if item.badge}
						<span
							class="inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] font-mono text-[10px] font-semibold group-data-[collapsible=icon]:hidden"
							style={item.badgeColor
								? `background:${item.badgeColor};color:var(--color-primary-foreground)`
								: 'background:var(--color-nav-badge-fallback);color:var(--color-nav-muted)'}
						>
							{item.badge}
						</span>
						<span
							class="absolute right-1 top-1 hidden h-2 w-2 rounded-full group-data-[collapsible=icon]:block"
							style={`background:${item.badgeColor ?? 'var(--color-nav-badge)'}`}
							aria-hidden="true"
						></span>
					{/if}
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<!--
	Desktop rail — shadcn Sidebar in icon-collapse mode. The generated <Sidebar> renders its own
	desktop branch only at >=880px (the is-mobile hook breakpoint is aligned to 880px); below that
	it renders an inert, always-closed Sheet (never opened — the bits-ui Dialog drawer below owns
	mobile, fallback path). Collapse state + the Cmd/Ctrl+B shortcut + cookie persistence come from
	the SidebarProvider wrapping this in AppShell.
-->
<Sidebar.Root
	collapsible="icon"
	class="group-data-[side=left]:border-e-0 group-data-[side=right]:border-s-0"
>
	<Sidebar.Header class="gap-0 p-0">
		<!-- expanded brand row -->
		<div
			class="flex items-center gap-[11px] px-4 pb-[14px] pt-4 group-data-[collapsible=icon]:hidden"
		>
			<div
				class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary text-[17px] font-extrabold shadow-nav-brand"
			>
				V
			</div>
			<div class="min-w-0 flex-1">
				<div class="text-[14px] font-extrabold tracking-[-0.3px]">Veent CRM</div>
				<div class="font-mono text-[8px] uppercase tracking-[1.6px] text-nav-faint">
					Outreach Console
				</div>
			</div>
			<span class="h-[7px] w-[7px] rounded-full bg-nav-presence shadow-nav-presence"></span>
			<Sidebar.Trigger class="text-nav-faint hover:bg-white/5 hover:text-white" />
		</div>
		<!-- collapsed: shows the brand logo by default; hover cross-fades to the toggle control in the same slot -->
		<div class="hidden justify-center px-2 pb-[14px] pt-4 group-data-[collapsible=icon]:flex">
			<div
				class="group/collapsed-trigger relative flex h-[34px] w-[34px] items-center justify-center"
			>
				<div
					class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[9px] bg-primary text-[17px] font-extrabold shadow-nav-brand opacity-100 transition-opacity group-hover/collapsed-trigger:opacity-0 pointer-coarse:opacity-0"
					aria-hidden="true"
				>
					V
				</div>
				<Sidebar.Trigger
					class="absolute inset-0 size-[34px] rounded-[9px] text-nav-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-white focus-visible:opacity-100 group-hover/collapsed-trigger:opacity-100 pointer-coarse:opacity-100"
				/>
			</div>
		</div>
	</Sidebar.Header>

	<Sidebar.Content class="gap-0 px-3 py-1">
		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel
				class="px-2.5 pb-[7px] pt-2 font-mono text-[9.5px] uppercase tracking-[1.4px] text-nav-section group-data-[collapsible=icon]:hidden"
			>
				Workspace
			</Sidebar.GroupLabel>
			<Sidebar.Menu
				class="gap-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1"
			>
				{#each work as item (item.href)}{@render deskNav(item)}{/each}
			</Sidebar.Menu>
		</Sidebar.Group>

		{#if isManagerRole(user?.role)}
			<Sidebar.Group class="p-0">
				<Sidebar.GroupLabel
					class="px-2.5 pb-[7px] pt-[18px] font-mono text-[9.5px] uppercase tracking-[1.4px] text-nav-section group-data-[collapsible=icon]:hidden"
				>
					Manager
				</Sidebar.GroupLabel>
				<Sidebar.Menu
					class="gap-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1"
				>
					{#each manager as item (item.href)}{@render deskNav(item)}{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{/if}
	</Sidebar.Content>

	<Sidebar.Footer class="p-0">
		<div
			class="flex items-center gap-2.5 border-t border-nav-border px-[14px] py-[11px] group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
		>
			<div class="relative shrink-0">
				<div
					class="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-[12px] font-semibold"
				>
					{user?.name?.[0] ?? '?'}
				</div>
				<span
					class="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full border-2 border-nav-bg bg-nav-presence"
				></span>
			</div>
			<div class="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
				<div class="text-[12.5px] font-semibold">{user?.name ?? 'Signed out'}</div>
				<div class="font-mono text-[9.5px] text-nav-faint">
					{user?.role ? roleLabel(user.role) : '—'}{user?.location ? ` · ${user.location}` : ''}
				</div>
			</div>
			<button
				onclick={signOut}
				title="Sign out"
				aria-label="Sign out"
				class="focus-ring rounded-control p-1 text-nav-faint hover:text-white"
			>
				<Icon name="logout" size={16} />
			</button>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>

<!--
	Mobile nav drawer — off-canvas left sheet via the bits-ui Dialog primitive (repo's 100%
	controlled-open convention: `bind:open`, no Dialog.Trigger). Dialog gives focus-trap,
	Escape-to-close, outside-click-to-close, and focus-return-to-trigger for free (C4). The drawer
	auto-closes on destination select / sign-out via the onNavigate callback passed to railBody (C5).
-->
<Dialog.Root bind:open={mobileOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
		/>
		<Dialog.Content
			class="fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] flex-col bg-nav-bg text-nav-fg shadow-pop outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
		>
			<Dialog.Title class="sr-only">Navigation menu</Dialog.Title>
			<Dialog.Description class="sr-only">
				Primary navigation and account actions
			</Dialog.Description>
			<Dialog.Close
				aria-label="Close navigation menu"
				class="focus-ring absolute right-3 top-3 rounded-control p-1 text-nav-faint hover:text-white"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</Dialog.Close>
			{@render railBody(() => (mobileOpen = false))}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
