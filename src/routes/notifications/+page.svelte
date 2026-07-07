<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { DashboardSectionSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import { relativeFromNow } from '$lib/utils/dates';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	const navLoading = $derived(navigating.to?.url.pathname === '/notifications');

	// Optimistic shadow — writable `$derived` re-syncs to server truth after invalidateAll().
	let shadow = $derived(data.notifications);

	// Per-notification pending state (also the duplicate-submit guard).
	let dismissing = $state<Record<string, boolean>>({});

	// Screen-reader announcement for the optimistic remove (non-navigation state change).
	let liveMessage = $state('');

	/** Mark read / dismiss. Optimistic: remove now, rollback on failure. */
	async function dismiss(n: Notification) {
		if (dismissing[n.id]) return; // duplicate-submit guard
		dismissing = { ...dismissing, [n.id]: true };
		shadow = removeFromList(shadow, n.id);
		liveMessage = 'Dismissed notification';
		try {
			const res = await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				if (!shadow.some((s) => s.id === n.id)) shadow = [...shadow, n];
				liveMessage = 'Dismiss failed';
				toasts.push(`Dismiss failed: ${msg}`);
				return;
			}
		} catch {
			if (!shadow.some((s) => s.id === n.id)) shadow = [...shadow, n];
			liveMessage = 'Dismiss failed';
			toasts.push('Dismiss failed — server error');
			return;
		} finally {
			dismissing = { ...dismissing, [n.id]: false };
		}
		await invalidateAll();
	}
</script>

<svelte:head><title>Notifications · Veent CRM</title></svelte:head>

<div class="sr-only" role="status" aria-live="polite">{liveMessage}</div>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Notifications"
		subtitle="Alerts from your team — newest first. Dismiss to clear the badge."
	/>

	{#if navLoading}
		<DashboardSectionSkeleton sections={1} />
	{:else if shadow.length === 0}
		<EmptyState
			title="No notifications yet"
			hint="You'll see an alert here when a manager assigns a lead to you."
			tone="success"
		/>
	{:else}
		<div class="overflow-hidden rounded-control border border-hairline bg-panel">
			{#each shadow as n (n.id)}
				<div
					class="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0 {n.readAt
						? 'bg-panel'
						: 'bg-panel-sunken'}"
				>
					<span
						class="h-2 w-2 shrink-0 rounded-full {n.readAt ? 'bg-transparent' : 'bg-primary'}"
						aria-hidden="true"
					></span>
					<div class="min-w-0 flex-1">
						{#if n.leadId}
							<a
								href="/leads/{n.leadId}"
								class="focus-ring block truncate rounded-[3px] text-[13.5px] {n.readAt
									? 'font-medium text-ink-600'
									: 'font-semibold text-ink'} hover:text-primary"
							>
								{n.message}
							</a>
						{:else}
							<span
								class="block truncate text-[13.5px] {n.readAt
									? 'font-medium text-ink-600'
									: 'font-semibold text-ink'}"
							>
								{n.message}
							</span>
						{/if}
						<div class="mt-0.5 font-mono text-[11px] text-ink-200">
							{relativeFromNow(n.createdAt)}
						</div>
					</div>
					{#if !n.readAt}
						<button
							onclick={() => dismiss(n)}
							disabled={dismissing[n.id]}
							title="Dismiss"
							aria-label="Dismiss notification"
							class="focus-ring shrink-0 rounded-control p-1.5 text-ink-200 hover:bg-white/5 hover:text-ink-600 disabled:opacity-50"
						>
							<Icon name="check" size={16} />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
