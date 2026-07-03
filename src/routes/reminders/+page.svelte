<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadListRow from '$lib/components/leads/LeadListRow.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { DashboardSectionSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	const navLoading = $derived(navigating.to?.url.pathname === '/reminders');

	type Bucket = 'overdue' | 'due' | 'upcoming' | 'cold';

	// Per-bucket optimistic shadows — each writable `$derived` re-syncs to server truth
	// whenever its `data.*` array changes (after invalidateAll()).
	let shadowOverdue = $derived(data.overdue);
	let shadowDue = $derived(data.due);
	let shadowUpcoming = $derived(data.upcoming);
	let shadowCold = $derived(data.cold);

	// Per-lead snooze pending state (also the duplicate-submit guard).
	let snoozing = $state<Record<string, boolean>>({});

	// Screen-reader announcement for the optimistic remove (D2 — non-navigation state change).
	let liveMessage = $state('');

	const groups = $derived([
		{
			key: 'overdue' as const,
			title: 'Overdue',
			color: '#dc2626',
			hint: 'past their booked follow-up date',
			rows: shadowOverdue
		},
		{
			key: 'due' as const,
			title: 'Due today',
			color: '#d97706',
			hint: 'follow-up due today',
			rows: shadowDue
		},
		{
			key: 'upcoming' as const,
			title: 'Upcoming',
			color: '#2563eb',
			hint: 'follow-up booked in the next 7 days',
			rows: shadowUpcoming
		},
		{
			key: 'cold' as const,
			title: 'Going cold',
			color: '#9ca3af',
			hint: 're-touch before they lapse',
			rows: shadowCold
		}
	]);
	const total = $derived(groups.reduce((n, g) => n + g.rows.length, 0));

	/** Snooze for 3 days (Asia/Manila midnight). Optimistic: remove now, rollback on failure. */
	async function snooze(l: Lead, bucket: Bucket) {
		if (snoozing[l.id]) return; // duplicate-submit guard
		snoozing = { ...snoozing, [l.id]: true };
		const followUpAt = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', {
			timeZone: 'Asia/Manila'
		});
		// Optimistic remove from the correct bucket.
		if (bucket === 'overdue') shadowOverdue = removeFromList(shadowOverdue, l.id);
		else if (bucket === 'due') shadowDue = removeFromList(shadowDue, l.id);
		else if (bucket === 'upcoming') shadowUpcoming = removeFromList(shadowUpcoming, l.id);
		else shadowCold = removeFromList(shadowCold, l.id);
		liveMessage = `Snoozed ${l.name}, follow-up in 3 days`;
		try {
			const res = await fetch(`/api/leads/${l.id}/snooze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ followUpAt })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				// Targeted rollback: restore only this lead to its original bucket.
				if (bucket === 'overdue' && !shadowOverdue.some((s) => s.id === l.id))
					shadowOverdue = [...shadowOverdue, l];
				else if (bucket === 'due' && !shadowDue.some((s) => s.id === l.id))
					shadowDue = [...shadowDue, l];
				else if (bucket === 'upcoming' && !shadowUpcoming.some((s) => s.id === l.id))
					shadowUpcoming = [...shadowUpcoming, l];
				else if (bucket === 'cold' && !shadowCold.some((s) => s.id === l.id))
					shadowCold = [...shadowCold, l];
				liveMessage = `Snooze failed for ${l.name}`;
				toasts.push(`Snooze failed: ${msg}`);
				return;
			}
		} catch {
			if (bucket === 'overdue' && !shadowOverdue.some((s) => s.id === l.id))
				shadowOverdue = [...shadowOverdue, l];
			else if (bucket === 'due' && !shadowDue.some((s) => s.id === l.id))
				shadowDue = [...shadowDue, l];
			else if (bucket === 'upcoming' && !shadowUpcoming.some((s) => s.id === l.id))
				shadowUpcoming = [...shadowUpcoming, l];
			else if (bucket === 'cold' && !shadowCold.some((s) => s.id === l.id))
				shadowCold = [...shadowCold, l];
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
			title="Nothing due or coming up soon"
			hint="Every follow-up is scheduled and under control. Go prospect or check Up for grabs."
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
							<LeadListRow
								{lead}
								onSnooze={(l) => snooze(l, g.key)}
								onNudge={nudge}
								snoozing={snoozing[lead.id]}
							/>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
