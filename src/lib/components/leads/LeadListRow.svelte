<script lang="ts">
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import type { Lead } from '$lib/types';

	let {
		lead,
		onSnooze,
		onNudge
	}: { lead: Lead; onSnooze?: (l: Lead) => void; onNudge?: (l: Lead) => void } = $props();

	const eventLine = $derived(
		lead.eventDate ? `${lead.eventName ?? '—'} · ${lead.eventDate}` : (lead.eventName ?? '—')
	);
</script>

<div
	class="flex min-h-10 items-center gap-3 border-b border-panel-sunken px-3.5 py-[9px] last:border-b-0 hover:bg-[#fdf7f5]"
>
	<PlatformBadge platform={lead.platform} />
	<a href="/leads/{lead.id}" class="min-w-0 flex-1">
		<div class="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink">
			{lead.name}
			{#if lead.siblings}
				<span
					class="rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[10px] text-stale"
				>
					{lead.siblings} events
				</span>
			{/if}
		</div>
		<div class="mt-0.5 font-mono text-[12px] text-ink-400">{eventLine}</div>
	</a>
	<StageChip stage={lead.stage} />
	<AgeBadge label={lead.age.label} type={lead.age.type} />
	<div class="flex shrink-0 gap-1.5">
		<a
			href="/leads/{lead.id}"
			class="flex h-[30px] items-center rounded-[7px] bg-primary px-[11px] text-[12px] font-semibold text-white hover:bg-primary-strong"
		>
			Log touch
		</a>
		<button
			onclick={() => onSnooze?.(lead)}
			class="h-[30px] rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 hover:bg-panel-sunken"
		>
			Snooze
		</button>
		<button
			onclick={() => onNudge?.(lead)}
			class="h-[30px] rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 hover:bg-panel-sunken"
		>
			Nudge
		</button>
	</div>
</div>
