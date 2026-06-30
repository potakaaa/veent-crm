<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Stat from '$lib/components/shared/Stat.svelte';
	import LeadListRow from '$lib/components/leads/LeadListRow.svelte';
	import { LeadRowSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import { todayLabel } from '$lib/utils/dates';
	import type { Lead, Urgency } from '$lib/types';

	let { data } = $props();

	// Optimistic shadow of the Today list. E1: a writable `$derived` IS the reconcile
	// mechanism — it can be reassigned for an optimistic update, and automatically
	// re-syncs to server truth whenever `data.leads` changes (i.e. after invalidateAll()).
	let shadowLeads = $derived(data.leads);

	// Per-lead snooze pending state (also the duplicate-submit guard).
	let snoozing = $state<Record<string, boolean>>({});

	// Show the skeleton only while navigating TO this route (never when leaving it),
	// so already-loaded content is never blanked.
	const navLoading = $derived(navigating.to?.url.pathname === '/');

	type Group = { key: Urgency; title: string; color: string; hint: string; empty: string };
	const groupDefs: Group[] = [
		{
			key: 'overdue',
			title: 'Overdue follow-ups',
			color: '#e11d48',
			hint: 'past their booked follow-up date',
			empty: 'Nothing overdue — nice.'
		},
		{
			key: 'due',
			title: 'Due today',
			color: '#c0362c',
			hint: 'follow-ups booked for today (Manila)',
			empty: 'Nothing due — go prospect.'
		},
		{
			key: 'replied',
			title: 'Replied — strike while warm',
			color: '#7c3aed',
			hint: 'they answered; reply before it cools',
			empty: 'No fresh replies right now.'
		},
		{
			key: 'cold',
			title: 'Going cold (>30d no reply)',
			color: '#c2710c',
			hint: "don't auto-lose these — re-touch",
			empty: 'Nothing going cold.'
		}
	];

	const groups = $derived(
		groupDefs.map((g) => ({ ...g, rows: shadowLeads.filter((l: Lead) => l.urgency === g.key) }))
	);
	const count = (k: Urgency) => shadowLeads.filter((l: Lead) => l.urgency === k).length;

	/** Snooze for 3 days (Asia/Manila midnight). Optimistic: remove from Today now, rollback on failure. */
	async function snooze(l: Lead) {
		if (snoozing[l.id]) return; // duplicate-submit guard
		snoozing = { ...snoozing, [l.id]: true };
		const followUpAt = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', {
			timeZone: 'Asia/Manila'
		});
		const snapshot = shadowLeads;
		shadowLeads = removeFromList(shadowLeads, l.id); // optimistic remove
		try {
			const res = await fetch(`/api/leads/${l.id}/snooze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ followUpAt })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = snapshot; // rollback
				toasts.push(`Snooze failed: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = snapshot; // rollback on network error
			toasts.push('Snooze failed — server error');
			return;
		} finally {
			snoozing = { ...snoozing, [l.id]: false };
		}
		await invalidateAll(); // $effect reconciles shadow with server truth
		toasts.push(`Snoozed ${l.name} · follow-up in 3 days`);
	}

	const nudge = (l: Lead) =>
		toasts.push(`Nudge: no outbound messaging integration yet (${l.name})`);
</script>

<svelte:head><title>Today · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[940px] px-7 pb-16 pt-6">
	<PageHeader
		title="Today"
		subtitle={`Good morning, ${data.me?.name ?? 'there'}. Your queue is sorted by urgency — clear the top first.`}
	>
		{#snippet meta()}
			{todayLabel()}<br /><span class="text-ink-100">Asia/Manila</span>
		{/snippet}
	</PageHeader>

	<div class="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		<Stat value={count('due')} label="due today" accent="#c0362c" />
		<Stat value={count('overdue')} label="overdue" accent="#e11d48" emphasize />
		<Stat value={count('cold')} label="going cold" accent="#c2710c" emphasize />
		<Stat value={count('replied')} label="replied — strike while warm" accent="#0e9f6e" emphasize />
	</div>

	{#each groupDefs as g (g.key)}
		{@const grp = groups.find((gr) => gr.key === g.key)}
		<div class="mb-5">
			<div class="mb-2.5 flex items-center gap-2.5">
				<span class="h-2 w-2 rounded-full" style="background:{g.color}"></span>
				<h2 class="font-serif text-[15px] font-semibold text-ink">{g.title}</h2>
				{#if navLoading}
					<span class="inline-block h-4 w-5 animate-pulse rounded bg-muted"></span>
				{:else}
					<span
						class="rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px] text-ink-300"
					>
						{grp?.rows.length ?? 0}
					</span>
				{/if}
				<span class="text-[12px] text-ink-200">{g.hint}</span>
			</div>
			<div class="overflow-hidden rounded-control border border-hairline bg-panel">
				{#if navLoading}
					<LeadRowSkeleton count={2} />
				{:else}
					{#each grp?.rows ?? [] as lead (lead.id)}
						<LeadListRow {lead} onSnooze={snooze} onNudge={nudge} snoozing={snoozing[lead.id]} />
					{:else}
						<div class="p-[22px] text-center text-[13px] text-ink-200">{g.empty}</div>
					{/each}
				{/if}
			</div>
		</div>
	{/each}

	<div class="mt-2 flex flex-wrap items-center gap-3.5 font-mono text-[11px] text-ink-200">
		{#each [['j k', 'move'], ['↵', 'open'], ['e', 'log touch'], ['s', 'snooze']] as [key, label]}
			<span
				><kbd class="rounded-[4px] bg-panel-sunken px-1.5 py-0.5 text-ink-600">{key}</kbd>
				{label}</span
			>
		{/each}
	</div>
</div>
