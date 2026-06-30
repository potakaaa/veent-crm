<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import type { Lead, User } from '$lib/types';

	let {
		leads,
		users,
		sort = 'lastActivity',
		dir = 'desc',
		onSort
	}: {
		leads: Lead[];
		users: User[];
		sort?: string;
		dir?: 'asc' | 'desc';
		onSort?: (col: string) => void;
	} = $props();
	const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;

	const cols = 'grid grid-cols-[2.4fr_1.7fr_1fr_0.9fr_1fr_0.7fr] gap-3';

	function sortCls(col: string) {
		return sort === col
			? 'text-left text-ink-600 font-semibold underline underline-offset-2 cursor-pointer'
			: 'text-left text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2 cursor-pointer';
	}
	function sortInd(col: string) {
		return sort === col ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
	}
</script>

<div class="overflow-hidden rounded-control border border-hairline bg-panel">
	<div
		class="{cols} border-b border-hairline bg-[#fdf7f5] px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
	>
		<button onclick={() => onSort?.('name')} class={sortCls('name')}
			>Organizer / page{sortInd('name')}</button
		>
		<button onclick={() => onSort?.('event')} class={sortCls('event')}
			>Event{sortInd('event')}</button
		>
		<button onclick={() => onSort?.('stage')} class={sortCls('stage')}
			>Stage{sortInd('stage')}</button
		>
		<span>Owner</span>
		<button onclick={() => onSort?.('lastActivity')} class={sortCls('lastActivity')}
			>Last activity{sortInd('lastActivity')}</button
		>
		<button onclick={() => onSort?.('platform')} class={sortCls('platform')}
			>Platform{sortInd('platform')}</button
		>
	</div>
	{#each leads as l (l.id)}
		<a
			href="/leads/{l.id}"
			class="{cols} min-h-[42px] items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fdf7f5]"
		>
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
		</a>
	{:else}
		<EmptyState
			title="Nothing here yet"
			hint="No leads match this view — go prospect, or check Up for grabs."
		/>
	{/each}
</div>
