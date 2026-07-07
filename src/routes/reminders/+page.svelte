<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadListRow from '$lib/components/leads/LeadListRow.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import Tabs from '$lib/components/ui/tabs/Tabs.svelte';
	import {
		Command,
		CommandInput,
		CommandList,
		CommandGroup,
		CommandItem,
		CommandEmpty
	} from '$lib/components/ui/command';
	import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover';
	import { DashboardSectionSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	const navLoading = $derived(navigating.to?.url.pathname === '/reminders');

	type Bucket = 'overdue' | 'due' | 'upcoming' | 'cold' | 'all';

	// Per-bucket optimistic shadows — each writable `$derived` re-syncs to server truth
	// whenever its `data.*` array changes (after invalidateAll()).
	let shadowOverdue = $derived(data.overdue);
	let shadowDue = $derived(data.due);
	let shadowUpcoming = $derived(data.upcoming);
	let shadowCold = $derived(data.cold);
	let shadowAll = $derived(data.allFollowUps);

	// Per-lead snooze pending state (also the duplicate-submit guard).
	let snoozing = $state<Record<string, boolean>>({});

	// Screen-reader announcement for the optimistic remove (D2 — non-navigation state change).
	let liveMessage = $state('');

	// Active tab (client-only state; survives the rep-filter navigation since the route stays).
	let activeTab = $state<'sections' | 'all'>('sections');
	const tabs = [
		{ value: 'sections', label: 'Sections' },
		{ value: 'all', label: 'All Follow-Ups' }
	];

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

	// Manager rep-filter combobox: popover open state + client-side search over the roster.
	let repOpen = $state(false);
	let repQuery = $state('');
	const filteredReps = $derived(
		repQuery.trim()
			? data.activeReps.filter((r) => r.name.toLowerCase().includes(repQuery.trim().toLowerCase()))
			: data.activeReps
	);

	/** Manager rep-filter → drive a `?repId=` navigation so the server reloads with the filter. */
	function navigateRepFilter(repId: string | undefined) {
		goto(repId ? `/reminders?repId=${repId}` : '/reminders', { keepFocus: true, noScroll: true });
	}

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
		else if (bucket === 'cold') shadowCold = removeFromList(shadowCold, l.id);
		else shadowAll = removeFromList(shadowAll, l.id);
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
				else if (bucket === 'all' && !shadowAll.some((s) => s.id === l.id))
					shadowAll = [...shadowAll, l];
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
			else if (bucket === 'all' && !shadowAll.some((s) => s.id === l.id))
				shadowAll = [...shadowAll, l];
			liveMessage = `Snooze failed for ${l.name}`;
			toasts.push('Snooze failed — server error');
			return;
		} finally {
			snoozing = { ...snoozing, [l.id]: false };
		}
		await invalidateAll();
		toasts.push(`Snoozed ${l.name} · follow-up in 3 days`);
	}

	// Nudge is hidden (LeadListRow's NUDGE_ENABLED flag) until outbound messaging exists —
	// handler kept wired so re-enabling is a one-line flip.
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

	<div class="mb-5">
		<Tabs
			{tabs}
			value={activeTab}
			onValueChange={(v) => (activeTab = v as 'sections' | 'all')}
			variant="underline"
			ariaLabel="Reminders views"
		/>
	</div>

	{#if activeTab === 'sections'}
		{#if navLoading}
			<DashboardSectionSkeleton sections={2} />
		{:else if total === 0}
			<EmptyState
				title="Nothing due or coming up soon"
				hint="Every follow-up is scheduled and under control. Go prospect or check Unassigned Leads."
				tone="success"
			/>
		{:else}
			{#each groups as g (g.key)}
				{#if g.rows.length}
					<div class="mb-5">
						<div class="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background:{g.color}"></span>
							<h2 class="whitespace-nowrap font-serif text-[15px] font-semibold text-ink">
								{g.title}
							</h2>
							<span
								class="shrink-0 rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px] text-ink-300"
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
									showFollowUpMeta
									nudgeEnabled={data.nudgeEnabled}
								/>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	{:else}
		<!-- All Follow-Ups tab: uncapped flat list, sorted soonest-first server-side. -->
		{#if data.isManager}
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<span class="text-[12px] font-medium text-ink-500">Filter by rep</span>
				<Popover bind:open={repOpen}>
					<PopoverTrigger
						class="flex h-[34px] items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-600 hover:border-primary hover:text-primary"
					>
						{data.filterRepId == null
							? 'All reps'
							: data.filterRepId === data.meId
								? 'Mine'
								: (data.activeReps.find((r) => r.id === data.filterRepId)?.name ?? 'Rep')}
					</PopoverTrigger>
					<PopoverContent class="w-64 p-0" align="start">
						<!-- shouldFilter disabled so the pinned Quick filters stay visible while typing;
						     the reps list is filtered client-side via filteredReps. -->
						<Command shouldFilter={false}>
							<CommandInput
								placeholder="Search reps…"
								value={repQuery}
								oninput={(e) => (repQuery = e.currentTarget.value)}
							/>
							<CommandList>
								<CommandGroup heading="Quick filters">
									<CommandItem
										value="__mine__"
										data-chosen={data.filterRepId === data.meId ? '' : undefined}
										onSelect={() => {
											navigateRepFilter(data.meId);
											repOpen = false;
										}}>Mine</CommandItem
									>
									<CommandItem
										value="__all__"
										data-chosen={data.filterRepId == null ? '' : undefined}
										onSelect={() => {
											navigateRepFilter(undefined);
											repOpen = false;
										}}>All reps</CommandItem
									>
								</CommandGroup>
								<CommandGroup heading="Search reps">
									{#if filteredReps.length === 0}
										<CommandEmpty>No reps found.</CommandEmpty>
									{:else}
										{#each filteredReps as rep (rep.id)}
											<CommandItem
												value={rep.id}
												data-chosen={data.filterRepId === rep.id ? '' : undefined}
												onSelect={() => {
													navigateRepFilter(rep.id);
													repOpen = false;
												}}>{rep.name}</CommandItem
											>
										{/each}
									{/if}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</div>
		{/if}

		{#if navLoading}
			<DashboardSectionSkeleton sections={1} />
		{:else if shadowAll.length === 0}
			<EmptyState
				title="No pending follow-ups"
				hint="Nothing is booked yet. Log a touch on a lead to schedule its next follow-up."
				tone="success"
			/>
		{:else}
			<div class="overflow-hidden rounded-control border border-hairline bg-panel">
				{#each shadowAll as lead (lead.id)}
					<LeadListRow
						{lead}
						onSnooze={(l) => snooze(l, 'all')}
						onNudge={nudge}
						snoozing={snoozing[lead.id]}
						showFollowUpMeta
						nudgeEnabled={data.nudgeEnabled}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
