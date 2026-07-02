<script lang="ts">
	import OutcomeChip from '$lib/components/shared/OutcomeChip.svelte';
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

	const entries = $derived.by((): Entry[] => {
		const all: Entry[] = [
			...activities.map((a) => ({ kind: 'activity' as const, data: a })),
			...leadHistory.map((o) => ({ kind: 'history' as const, data: o }))
		];
		return all.sort((a, b) => {
			const ta = a.kind === 'activity' ? a.data.createdAt : a.data.at;
			const tb = b.kind === 'activity' ? b.data.createdAt : b.data.at;
			return tb.localeCompare(ta);
		});
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
	<div class="mb-3.5 flex items-center justify-between">
		<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Lead history</div>
		<span class="font-mono text-[11px] text-ink-300"
			>{entries.length} event{entries.length === 1 ? '' : 's'}</span
		>
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
