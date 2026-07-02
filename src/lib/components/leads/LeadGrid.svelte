<script lang="ts">
	import { makeSortTable } from '$lib/utils/tableSort';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import { riskMeta } from '$lib/utils/risk';
	import type { Lead, User } from '$lib/types';

	// Loader attaches derived `appealScore` to each lead at runtime (spread + extra field);
	// widen the prop type to reflect it.
	type LeadWithAppeal = Lead & { appealScore: number | null };

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
	const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;

	const cols = 'grid grid-cols-[28px_2.4fr_1.7fr_1fr_0.9fr_1fr_0.7fr_0.7fr] gap-3';

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

<div class="overflow-hidden rounded-control border border-hairline bg-panel">
	<div
		class="{cols} border-b border-hairline bg-panel-subtle px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
	>
		<span></span>
		{#each table.getHeaderGroups()[0].headers as header (header.id)}
			{#if header.column.getCanSort()}
				<button
					onclick={header.column.getToggleSortingHandler()}
					class={header.column.getIsSorted()
						? 'text-left font-semibold text-ink-600 underline underline-offset-2 cursor-pointer'
						: 'text-left text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2 cursor-pointer'}
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
	</div>
	{#if loading}
		{#each Array(8) as _, i (i)}
			<div
				class="{cols} min-h-[42px] items-center border-b border-panel-sunken px-4 last:border-b-0"
			>
				<Skeleton class="h-2 w-2 rounded-full" />
				<Skeleton class="h-3.5 w-3/4" />
				<Skeleton class="h-3.5 w-2/3" />
				<Skeleton class="h-3.5 w-1/2" />
				<Skeleton class="h-3.5 w-1/2" />
				<Skeleton class="h-3.5 w-2/3" />
				<Skeleton class="h-3.5 w-1/3" />
				<Skeleton class="h-3.5 w-1/3" />
			</div>
		{/each}
	{:else}
		{#each leads as l (l.id)}
			<a
				href="/leads/{l.id}"
				class="{cols} min-h-[42px] items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fcfbfd]"
			>
				<span
					class="h-2 w-2 rounded-full"
					style="background:{riskMeta(l.urgency).color}"
					title={riskMeta(l.urgency).label}
				></span>
				<div class="min-w-0">
					<div class="flex items-center gap-1.5 text-[13px] font-semibold">
						<span class="truncate">{l.name}</span>
						{#if l.siblings}
							<span
								class="shrink-0 rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale"
							>
								{l.siblings} events
							</span>
						{/if}
					</div>
					<div class="mt-px truncate font-mono text-[11px] text-ink-400">{l.handle}</div>
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
				<div><StageChip stage={l.stage} /></div>
				<div><Avatar name={ownerName(l.ownerId)} /></div>
				<div><AgeBadge label={l.age.label} type={l.age.type} /></div>
				<div><PlatformBadge platform={l.platform} /></div>
				<div><AppealScoreBadge score={l.appealScore} /></div>
			</a>
		{:else}
			<EmptyState
				title="Nothing here yet"
				hint="No leads match this view — go prospect, or check Up for grabs."
			/>
		{/each}
	{/if}
</div>
