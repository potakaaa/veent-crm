<script lang="ts">
	import { formatDate } from '$lib/utils/dates';
	import type { OwnerHistoryRow, User } from '$lib/types';

	let { ownerHistory, users }: { ownerHistory: OwnerHistoryRow[]; users: User[] } = $props();

	const nameOf = (id: string | null): string =>
		id ? (users.find((u) => u.id === id)?.name ?? 'Unknown') : 'Unassigned';

	function label(row: OwnerHistoryRow): string {
		if (!row.oldValue) return 'Lead claimed';
		if (!row.newValue) return 'Lead released';
		return 'Ownership transferred';
	}

	const when = (iso: string) =>
		formatDate(iso, { hour: 'numeric', minute: '2-digit' }).replace(',', ' ·');
</script>

{#if ownerHistory.length > 0}
	<div class="rounded-control border border-hairline bg-panel p-4">
		<div class="mb-3.5 flex items-center justify-between">
			<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
				Ownership history
			</div>
			<span class="font-mono text-[11px] text-ink-300"
				>{ownerHistory.length} event{ownerHistory.length === 1 ? '' : 's'}</span
			>
		</div>
		{#each ownerHistory as row (row.id)}
			<div class="flex gap-3 pb-4 last:pb-0">
				<div class="flex flex-col items-center">
					<span class="mt-1 h-[9px] w-[9px] rounded-full border-2 border-panel bg-ink-300"></span>
					<span class="mt-1 w-px flex-1 bg-hairline"></span>
				</div>
				<div class="flex-1 pb-0.5">
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span class="text-[12.5px] font-semibold">{label(row)}</span>
						<span class="ml-auto font-mono text-[11px] text-ink-200">{when(row.at)}</span>
					</div>
					<div class="mt-1 flex flex-wrap items-center gap-1 font-mono text-[11.5px]">
						<span class="text-ink-400">{nameOf(row.oldValue)}</span>
						<span class="text-ink-200">→</span>
						<span class="font-medium text-ink">{nameOf(row.newValue)}</span>
					</div>
					{#if row.actorUserId && row.actorUserId !== row.newValue}
						<div class="mt-0.5 font-mono text-[11px] text-ink-300">
							by {nameOf(row.actorUserId)}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
