<script lang="ts">
	import OutcomeChip from '$lib/components/shared/OutcomeChip.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { OUTCOME_TOKENS } from '$lib/design/tokens';
	import { formatDate } from '$lib/utils/dates';
	import { stageLabel } from '$lib/utils/stages';
	import type { Activity, OwnerHistoryRow, User } from '$lib/types';

	let {
		activities,
		leadHistory = [],
		users
	}: { activities: Activity[]; leadHistory?: OwnerHistoryRow[]; users: User[] } = $props();

	const CHANNEL_LABEL: Record<string, string> = {
		fb_dm: 'FB DM',
		fb_comment: 'FB comment',
		ig_dm: 'IG DM',
		email: 'Email',
		call: 'Call',
		meeting: 'Meeting',
		other: 'Other'
	};

	type Entry = { kind: 'activity'; data: Activity } | { kind: 'history'; data: OwnerHistoryRow };

	type FilterPreset = 'all' | '1d' | '3d' | '7d' | 'custom';

	let preset = $state<FilterPreset>('all');
	let customFrom = $state<string>('');
	let customTo = $state<string>('');
	let filterOpen = $state(false);

	const PRESET_LABEL: Record<FilterPreset, string> = {
		all: 'All time',
		'1d': 'Last 1 day',
		'3d': 'Last 3 days',
		'7d': 'Last 7 days',
		custom: 'Custom range'
	};

	const entryIso = (e: Entry) => (e.kind === 'activity' ? e.data.createdAt : e.data.at);

	// Choose a quick preset: reset any stale custom-range values and close the dropdown.
	function choosePreset(next: Exclude<FilterPreset, 'custom'>) {
		preset = next;
		customFrom = '';
		customTo = '';
		filterOpen = false;
	}

	// Changing either date input switches to the custom-range mode.
	function useCustom() {
		preset = 'custom';
	}

	// Reset the filter back to the "All time" default.
	function clearFilter() {
		preset = 'all';
		customFrom = '';
		customTo = '';
	}

	const allEntries = $derived.by((): Entry[] => {
		const all: Entry[] = [
			...activities.map((a) => ({ kind: 'activity' as const, data: a })),
			...leadHistory.map((o) => ({ kind: 'history' as const, data: o }))
		];
		return all.sort((a, b) => entryIso(b).localeCompare(entryIso(a)));
	});

	const entries = $derived.by((): Entry[] => {
		if (preset === 'all') return allEntries;

		if (preset === 'custom') {
			if (customFrom === '' && customTo === '') return allEntries;
			return allEntries.filter((e) => {
				const day = entryIso(e).slice(0, 10);
				if (customFrom !== '' && day < customFrom) return false;
				if (customTo !== '' && day > customTo) return false;
				return true;
			});
		}

		const days = preset === '1d' ? 1 : preset === '3d' ? 3 : 7;
		const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
		return allEntries.filter((e) => entryIso(e) >= cutoffIso);
	});

	const nameOf = (id: string | null) =>
		id ? (users.find((u) => u.id === id)?.name ?? 'Unknown') : 'Unassigned';

	const when = (iso: string) =>
		formatDate(iso, { hour: 'numeric', minute: '2-digit' }).replace(',', ' ·');

	function ownershipLabel(row: OwnerHistoryRow): string {
		if (!row.oldValue) return 'Lead claimed';
		if (!row.newValue) return 'Lead released';
		return 'Ownership transferred';
	}

	const fmtStage = (s: string | null) => (s ? stageLabel(s as import('$lib/types').Stage) : '—');
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3.5 flex items-center justify-between gap-2">
		<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Lead history</div>
		<div class="flex items-center gap-2">
			<span class="font-mono text-[11px] text-ink-300"
				>{entries.length} event{entries.length === 1 ? '' : 's'}</span
			>
			<Popover.Root bind:open={filterOpen}>
				<Popover.Trigger
					class="flex h-[26px] items-center gap-1 rounded-[6px] border border-hairline bg-panel px-2 font-mono text-[11px] text-ink-600 hover:border-primary hover:text-primary {preset !==
					'all'
						? 'border-primary text-primary'
						: ''}"
				>
					{PRESET_LABEL[preset]}
					<span aria-hidden="true" class="text-[9px] leading-none">▾</span>
				</Popover.Trigger>
				<Popover.Content align="end" class="w-52">
					<ul class="flex flex-col">
						{#each [['all', 'All time'], ['1d', 'Last 1 day'], ['3d', 'Last 3 days'], ['7d', 'Last 7 days']] as [value, optLabel] (value)}
							<li>
								<button
									type="button"
									onclick={() => choosePreset(value as Exclude<FilterPreset, 'custom'>)}
									class="flex w-full items-center justify-between rounded-[6px] px-1.5 py-[5px] text-left text-[12.5px] text-ink-600 hover:bg-[#fcfbfd] {preset ===
									value
										? 'font-semibold text-primary'
										: ''}"
								>
									<span>{optLabel}</span>
									{#if preset === value}<span aria-hidden="true">✓</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
					<div class="my-1.5 border-t border-hairline"></div>
					<div class="flex items-center justify-between pb-1">
						<span class="font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
							>Custom range</span
						>
						{#if preset !== 'all'}
							<button
								type="button"
								onclick={clearFilter}
								class="text-[11.5px] font-medium text-primary hover:underline"
							>
								Clear
							</button>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5 font-mono text-[11px] text-ink-300">
						<label class="flex items-center justify-between gap-2">
							<span class="uppercase tracking-[0.5px]">From</span>
							<input
								type="date"
								bind:value={customFrom}
								oninput={useCustom}
								class="rounded-[4px] border border-hairline bg-panel-sunken px-1.5 py-0.5 text-[11px] text-ink-600"
							/>
						</label>
						<label class="flex items-center justify-between gap-2">
							<span class="uppercase tracking-[0.5px]">To</span>
							<input
								type="date"
								bind:value={customTo}
								oninput={useCustom}
								class="rounded-[4px] border border-hairline bg-panel-sunken px-1.5 py-0.5 text-[11px] text-ink-600"
							/>
						</label>
					</div>
				</Popover.Content>
			</Popover.Root>
		</div>
	</div>
	<div class="max-h-[260px] overflow-y-auto pr-1">
		{#each entries as entry (entry.kind === 'activity' ? `a-${entry.data.id}` : `h-${entry.data.id}`)}
			<div class="flex gap-3 pb-4 last:pb-0">
				<div class="flex flex-col items-center">
					{#if entry.kind === 'activity'}
						<span
							class="mt-1 h-[9px] w-[9px] rounded-full border-2 border-panel"
							style="background:{OUTCOME_TOKENS[entry.data.outcome]
								?.hex};box-shadow:0 0 0 1px {OUTCOME_TOKENS[entry.data.outcome]?.hex}"
						></span>
					{:else if entry.data.field === 'stage'}
						<span class="mt-1 h-[9px] w-[9px] rounded-full border-2 border-panel bg-primary/60"
						></span>
					{:else}
						<span class="mt-1 h-[9px] w-[9px] rounded-full border-2 border-panel bg-ink-200"></span>
					{/if}
					<span class="mt-1 w-px flex-1 bg-hairline"></span>
				</div>

				{#if entry.kind === 'activity'}
					{@const a = entry.data}
					<div class="flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[12.5px] font-semibold">{nameOf(a.repId)}</span>
							<span
								class="rounded-[4px] bg-panel-sunken px-1.5 py-px font-mono text-[10.5px] text-ink-600"
							>
								{CHANNEL_LABEL[a.channel] ?? a.channel}
							</span>
							<OutcomeChip outcome={a.outcome} />
							<span class="ml-auto font-mono text-[11px] text-ink-200">{when(a.createdAt)}</span>
						</div>
						{#if a.note}
							<div class="mt-1.5 text-[13px] leading-relaxed text-ink-600">{a.note}</div>
						{/if}
					</div>
				{:else if entry.data.field === 'stage'}
					{@const o = entry.data}
					<div class="flex-1 pb-0.5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[12.5px] font-semibold text-ink-600">Stage changed</span>
							<span class="ml-auto font-mono text-[11px] text-ink-200">{when(o.at)}</span>
						</div>
						<div class="mt-0.5 flex items-center gap-1 font-mono text-[11.5px] text-ink-400">
							<span>{fmtStage(o.oldValue)}</span>
							<span class="text-ink-200">→</span>
							<span class="font-medium text-ink">{fmtStage(o.newValue)}</span>
							{#if o.actorUserId}
								<span class="text-ink-200">· by {nameOf(o.actorUserId)}</span>
							{/if}
						</div>
					</div>
				{:else}
					{@const o = entry.data}
					<div class="flex-1 pb-0.5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[12.5px] font-semibold text-ink-600">{ownershipLabel(o)}</span>
							<span class="ml-auto font-mono text-[11px] text-ink-200">{when(o.at)}</span>
						</div>
						<div class="mt-0.5 flex items-center gap-1 font-mono text-[11.5px] text-ink-400">
							<span>{nameOf(o.oldValue)}</span>
							<span class="text-ink-200">→</span>
							<span class="font-medium text-ink">{nameOf(o.newValue)}</span>
							{#if o.actorUserId}
								<span class="text-ink-200">· by {nameOf(o.actorUserId)}</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
