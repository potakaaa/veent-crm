<script lang="ts">
	import { makeSortTable } from '$lib/utils/tableSort';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import CompetitorBadge from '$lib/components/shared/CompetitorBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import DataGridShell from '$lib/components/leads/DataGridShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import CategoryChip from '$lib/components/categories/CategoryChip.svelte';
	import { riskMeta } from '$lib/utils/risk';
	import { isClosed } from '$lib/utils/stages';
	import { ownerNameFor } from '$lib/utils/owner';
	import { resolveAvatarColor } from '$lib/design/tokens';
	import type { Lead, User } from '$lib/types';

	type LeadCategory = { id: string; name: string; color: string | null };

	// Loader attaches derived `appealScore` + assigned `categories` to each lead at runtime
	// (spread + extra fields); widen the prop type to reflect it.
	type LeadWithAppeal = Lead & { appealScore: number | null; categories?: LeadCategory[] };

	// List rows show at most this many category chips; the rest collapse into a "+N" pill.
	const MAX_CHIPS = 3;

	let {
		leads,
		users,
		sort = 'lastActivity',
		dir = 'desc',
		loading = false,
		onSortChange
	}: {
		leads: LeadWithAppeal[];
		users: User[];
		sort?: string;
		dir?: 'asc' | 'desc';
		loading?: boolean;
		onSortChange?: (col: string, dir: 'asc' | 'desc') => void;
	} = $props();
	const ownerName = (id: string | null) => ownerNameFor(users, id);
	const ownerColor = (id: string | null) => {
		const u = id ? users.find((x) => x.id === id) : undefined;
		return resolveAvatarColor(u?.color, u?.name);
	};

	// Desktop column template (8 cells: risk dot + 7 data columns). Below `lg` the
	// DataGridShell collapses this into a stacked single-column card. fr-values adopted
	// from origin/development's alignment-fix (kept `lg:`-prefixed for the card-collapse).
	const cols = 'lg:grid-cols-[28px_2fr_1.6fr_1fr_0.85fr_1fr_0.65fr_1fr]';

	const table = $derived(
		makeSortTable({
			data: leads,
			columns: [
				{ id: 'name', header: 'Organizer / page' },
				{ id: 'event', header: 'Event' },
				{ id: 'stage', header: 'Stage' },
				{ id: '_owner', header: 'Owner', enableSorting: false },
				{ id: 'lastActivity', header: 'Last activity', sortDescFirst: true },
				{ id: 'platform', header: 'Platform' },
				{ id: 'appeal', header: 'Appeal', sortDescFirst: true }
			],
			sort: sort ?? '',
			dir,
			onToggle(id, desc) {
				onSortChange?.(id, desc ? 'desc' : 'asc');
			}
		})
	);
</script>

<DataGridShell {cols} {loading} skeletonCells={8} isEmpty={leads.length === 0}>
	{#snippet header()}
		<span></span>
		{#each table.getHeaderGroups()[0].headers as header (header.id)}
			{#if header.column.getCanSort()}
				<button
					onclick={header.column.getToggleSortingHandler()}
					class={header.column.getIsSorted()
						? 'cursor-pointer text-left font-semibold text-ink-600 underline underline-offset-2'
						: 'cursor-pointer text-left text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2'}
				>
					{header.column.columnDef.header}{header.column.getIsSorted() === 'asc'
						? ' ↑'
						: header.column.getIsSorted() === 'desc'
							? ' ↓'
							: ''}
				</button>
			{:else}
				<span>{header.column.columnDef.header}</span>
			{/if}
		{/each}
	{/snippet}

	{#snippet rows(rowClass)}
		{#each leads as l (l.id)}
			<a
				href="/leads/{l.id}"
				class="{rowClass} min-h-[52px] lg:items-center border-b border-panel-sunken px-4 py-3 last:border-b-0 hover:bg-[#fcfbfd]"
			>
				<div class="flex items-center gap-2 lg:contents">
					<span
						class="h-2 w-2 shrink-0 rounded-full"
						style="background:{riskMeta(l.urgency).color}"
						title={riskMeta(l.urgency).label}
					></span>
					<div class="min-w-0 flex-1 lg:contents">
						<div class="flex min-w-0 flex-col gap-0.5 text-[13px] font-semibold">
							<div class="flex min-w-0 items-center gap-1.5">
								<span class="truncate">{l.name}</span>
								{#if l.siblings}
									<span
										class="shrink-0 rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale"
									>
										{l.siblings} events
									</span>
								{/if}
								<CompetitorBadge platform={l.currentPlatform} />
							</div>
							{#if l.categories && l.categories.length > 0}
								<div class="flex flex-wrap items-center gap-1">
									{#each l.categories.slice(0, MAX_CHIPS) as cat (cat.id)}
										<CategoryChip category={cat} />
									{/each}
									{#if l.categories.length > MAX_CHIPS}
										<span
											class="shrink-0 rounded-[4px] bg-panel-sunken px-[5px] py-px font-mono text-[10px] text-ink-400"
										>
											+{l.categories.length - MAX_CHIPS} more
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="min-w-0">
					<div class="flex items-center gap-1.5">
						<span class="truncate text-[12.5px] text-ink-600">{l.eventName ?? '—'}</span>
						<EventBadge date={l.eventDate} />
					</div>
					{#if l.eventDate}
						<div class="mt-px font-mono text-[11px] text-ink-400">
							{new Date(l.eventDate + 'T00:00:00').toLocaleDateString('en-PH', {
								month: 'short',
								day: 'numeric',
								year: 'numeric'
							})}
						</div>
					{/if}
				</div>
				<div class="mt-1 flex flex-wrap items-center gap-1.5 lg:mt-0 lg:contents">
					<div class="flex items-center lg:contents"><StageChip stage={l.stage} /></div>
					<div class="flex min-w-0 items-center lg:contents">
						<Avatar name={ownerName(l.ownerId)} color={ownerColor(l.ownerId)} />
					</div>
					<div class="flex items-center">
						{#if !isClosed(l.stage)}
							<AgeBadge label={l.age.label} type={l.age.type} />
						{:else}
							<span class="text-ink-300">—</span>
						{/if}
					</div>
					<div class="flex items-center lg:contents"><PlatformBadge platform={l.platform} /></div>
					<div class="flex min-w-0 items-center lg:contents">
						<AppealScoreBadge score={l.appealScore} />
					</div>
				</div>
			</a>
		{/each}
	{/snippet}

	{#snippet empty()}
		<EmptyState
			icon="leads"
			title="Nothing here yet"
			hint="No leads match this view — go prospect, or check Unassigned Leads."
		>
			{#snippet actions()}
				<Button
					variant="outline"
					size="sm"
					href="/unassigned"
					class="border-stage-contacted text-stage-contacted hover:bg-stage-contacted/10"
					>Unassigned Leads</Button
				>
				<Button variant="destructive" size="sm" href="/leads/new">Add lead</Button>
			{/snippet}
		</EmptyState>
	{/snippet}
</DataGridShell>
