<script lang="ts">
	import OutcomeChip from '$lib/components/shared/OutcomeChip.svelte';
	import { OUTCOME_TOKENS } from '$lib/design/tokens';
	import { formatDate } from '$lib/utils/dates';
	import type { Activity, User } from '$lib/types';

	let { activities, users }: { activities: Activity[]; users: User[] } = $props();

	const CHANNEL_LABEL: Record<string, string> = {
		fb_dm: 'FB DM',
		fb_comment: 'FB comment',
		ig_dm: 'IG DM',
		email: 'Email',
		call: 'Call',
		meeting: 'Meeting',
		other: 'Other'
	};
	const repName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
	const when = (iso: string) =>
		formatDate(iso, { hour: 'numeric', minute: '2-digit' }).replace(',', ' ·');
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3.5 flex items-center justify-between">
		<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
			Activity timeline
		</div>
		<span class="font-mono text-[11px] text-ink-300">{activities.length} touches</span>
	</div>
	{#each activities as a (a.id)}
		<div class="flex gap-3 pb-4 last:pb-0">
			<div class="flex flex-col items-center">
				<span
					class="mt-1 h-[9px] w-[9px] rounded-full border-2 border-panel"
					style="background:{OUTCOME_TOKENS[a.outcome]?.hex};box-shadow:0 0 0 1px {OUTCOME_TOKENS[
						a.outcome
					]?.hex}"
				></span>
				<span class="mt-1 w-px flex-1 bg-hairline"></span>
			</div>
			<div class="flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-[12.5px] font-semibold">{repName(a.repId)}</span>
					<span
						class="rounded-[4px] bg-panel-sunken px-1.5 py-px font-mono text-[10.5px] text-ink-600"
					>
						{CHANNEL_LABEL[a.channel] ?? a.channel}
					</span>
					<OutcomeChip outcome={a.outcome} />
					<span class="ml-auto font-mono text-[11px] text-ink-200">{when(a.createdAt)}</span>
				</div>
				{#if a.note}<div class="mt-1.5 text-[13px] leading-relaxed text-ink-600">{a.note}</div>{/if}
			</div>
		</div>
	{/each}
</div>
