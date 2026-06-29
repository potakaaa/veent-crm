<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadListRow from '$lib/components/leads/LeadListRow.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { Lead, Urgency } from '$lib/types';

	let { data } = $props();

	const groupDefs: { key: Urgency; title: string; color: string; hint: string }[] = [
		{ key: 'overdue', title: 'Overdue', color: '#e11d48', hint: 'past their booked follow-up date' },
		{ key: 'due', title: 'Due today', color: '#c0362c', hint: 'follow-ups booked for today (Manila)' },
		{ key: 'cold', title: 'Going cold', color: '#c2710c', hint: 're-touch before they lapse' }
	];
	const groups = $derived(
		groupDefs.map((g) => ({ ...g, rows: data.leads.filter((l: Lead) => l.urgency === g.key) }))
	);
	const total = $derived(groups.reduce((n, g) => n + g.rows.length, 0));

	const snooze = (l: Lead) => toasts.push(`Snoozed ${l.name} — rebooked follow-up`);
	const nudge = (l: Lead) => toasts.success(`Nudge sent to ${l.name}`);
</script>

<svelte:head><title>Reminders · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[940px] px-7 pb-16 pt-6">
	<PageHeader
		title="Reminders"
		subtitle="Follow-ups booked from your logged touches. Activities drive these dates — log a touch to rebook."
	/>

	{#if total === 0}
		<EmptyState title="Nothing due" hint="Every follow-up is booked for later. Go prospect or check Up for grabs." tone="success" />
	{:else}
		{#each groups as g (g.key)}
			{#if g.rows.length}
				<div class="mb-5">
					<div class="mb-2.5 flex items-center gap-2.5">
						<span class="h-2 w-2 rounded-full" style="background:{g.color}"></span>
						<h2 class="font-serif text-[15px] font-semibold text-ink">{g.title}</h2>
						<span class="rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px] text-ink-300">{g.rows.length}</span>
						<span class="text-[12px] text-ink-200">{g.hint}</span>
					</div>
					<div class="overflow-hidden rounded-control border border-hairline bg-panel">
						{#each g.rows as lead (lead.id)}
							<LeadListRow {lead} onSnooze={snooze} onNudge={nudge} />
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
