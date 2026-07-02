<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadListRow from '$lib/components/leads/LeadListRow.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { DashboardSectionSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import type { Lead, Urgency } from '$lib/types';

	let { data } = $props();

	const navLoading = $derived(navigating.to?.url.pathname === '/reminders');

	// Optimistic shadow of the reminders list — aligned to Today's pattern (AC13). A writable
	// `$derived` re-syncs to server truth whenever `data.leads` changes (after invalidateAll()).
	let shadowLeads = $derived(data.leads);

	// Per-lead snooze pending state (also the duplicate-submit guard).
	let snoozing = $state<Record<string, boolean>>({});

	// Screen-reader announcement for the optimistic remove (D2 — non-navigation state change).
	let liveMessage = $state('');

	const groupDefs: { key: Urgency; title: string; color: string; hint: string }[] = [
		{
			key: 'overdue',
			title: 'Overdue',
			color: '#dc2626',
			hint: 'past their booked follow-up date'
		},
		{ key: 'cold', title: 'Going cold', color: '#d97706', hint: 're-touch before they lapse' }
	];

	const groups = $derived(
		groupDefs.map((g) => ({ ...g, rows: shadowLeads.filter((l: Lead) => l.urgency === g.key) }))
	);
	const total = $derived(groups.reduce((n, g) => n + g.rows.length, 0));

	/** Snooze for 3 days (Asia/Manila midnight). Optimistic: remove now, rollback on failure. */
	async function snooze(l: Lead) {
		if (snoozing[l.id]) return; // duplicate-submit guard
		snoozing = { ...snoozing, [l.id]: true };
		const followUpAt = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', {
			timeZone: 'Asia/Manila'
		});
		shadowLeads = removeFromList(shadowLeads, l.id); // optimistic remove
		liveMessage = `Snoozed ${l.name}, follow-up in 3 days`;
		try {
			const res = await fetch(`/api/leads/${l.id}/snooze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ followUpAt })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				// Targeted rollback: restore only this lead so concurrent snoozes aren't undone.
				if (!shadowLeads.some((s) => s.id === l.id)) shadowLeads = [...shadowLeads, l];
				liveMessage = `Snooze failed for ${l.name}`;
				toasts.push(`Snooze failed: ${msg}`);
				return;
			}
		} catch {
			if (!shadowLeads.some((s) => s.id === l.id)) shadowLeads = [...shadowLeads, l];
			liveMessage = `Snooze failed for ${l.name}`;
			toasts.push('Snooze failed — server error');
			return;
		} finally {
			snoozing = { ...snoozing, [l.id]: false };
		}
		await invalidateAll();
		toasts.push(`Snoozed ${l.name} · follow-up in 3 days`);
	}

	const nudge = (l: Lead) =>
		toasts.push(`Nudge: no outbound messaging integration yet (${l.name})`);
</script>

<svelte:head><title>Reminders · Veent CRM</title></svelte:head>

<div class="sr-only" role="status" aria-live="polite">{liveMessage}</div>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Reminders"
		subtitle="Follow-ups booked from your logged touches. Activities drive these dates — log a touch to rebook."
	/>

	{#if navLoading}
		<DashboardSectionSkeleton sections={2} />
	{:else if total === 0}
		<EmptyState
			title="Nothing due"
			hint="Every follow-up is booked for later. Go prospect or check Up for grabs."
			tone="success"
		/>
	{:else}
		{#each groups as g (g.key)}
			{#if g.rows.length}
				<div class="mb-5">
					<div class="mb-2.5 flex items-center gap-2.5">
						<span class="h-2 w-2 rounded-full" style="background:{g.color}"></span>
						<h2 class="font-serif text-[15px] font-semibold text-ink">{g.title}</h2>
						<span
							class="rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px] text-ink-300"
							>{g.rows.length}</span
						>
						<span class="text-[12px] text-ink-200">{g.hint}</span>
					</div>
					<div class="overflow-hidden rounded-control border border-hairline bg-panel">
						{#each g.rows as lead (lead.id)}
							<LeadListRow {lead} onSnooze={snooze} onNudge={nudge} snoozing={snoozing[lead.id]} />
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
