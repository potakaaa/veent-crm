<script lang="ts">
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { riskMeta } from '$lib/utils/risk';
	import type { Lead } from '$lib/types';

	let {
		lead,
		onSnooze,
		onNudge,
		snoozing = false
	}: {
		lead: Lead;
		onSnooze?: (l: Lead) => void;
		onNudge?: (l: Lead) => void;
		snoozing?: boolean;
	} = $props();

	const eventLine = $derived(
		lead.eventDate ? `${lead.eventName ?? '—'} · ${lead.eventDate}` : (lead.eventName ?? '—')
	);
	const risk = $derived(riskMeta(lead.urgency));
</script>

<div
	class="flex min-h-10 items-center gap-3 border-b border-panel-sunken px-3.5 py-[9px] last:border-b-0 hover:bg-[#fcfbfd]"
>
	<PlatformBadge platform={lead.platform} />
	<a href="/leads/{lead.id}" class="min-w-0 flex-1">
		<div class="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink">
			{lead.name}
			{#if lead.siblings}
				<span
					class="rounded-[4px] bg-[rgba(217,119,6,0.1)] px-[5px] py-px font-mono text-[10px] text-stale"
				>
					{lead.siblings} events
				</span>
			{/if}
		</div>
		<div class="mt-0.5 font-mono text-[12px] text-ink-400">{eventLine}</div>
	</a>
	<div class="flex shrink-0 flex-col items-end gap-1">
		<StageChip stage={lead.stage} />
		<AgeBadge label={lead.age.label} type={lead.age.type} />
		{#if lead.hasFutureEvents}
			<Badge
				variant="outline"
				class="border-violet-300 bg-violet-100 text-[10px] font-semibold uppercase tracking-[0.3px] text-violet-700"
			>
				Future Events
			</Badge>
		{/if}
	</div>
	<div class="w-[150px] shrink-0 max-[1100px]:hidden">
		<div class="font-mono text-[9px] uppercase tracking-[0.5px] text-ink-200">next</div>
		<div class="text-[12px] font-semibold" style="color:{risk.color}">{risk.label}</div>
	</div>
	<div class="flex shrink-0 gap-1.5">
		<a
			href="/leads/{lead.id}"
			class="flex h-[30px] items-center rounded-[7px] bg-primary px-[11px] text-[12px] font-semibold text-white hover:bg-primary-strong"
		>
			Log touch
		</a>
		<button
			onclick={() => onSnooze?.(lead)}
			disabled={snoozing}
			class="h-[30px] rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 hover:bg-panel-sunken disabled:opacity-50"
		>
			{snoozing ? 'Snoozing…' : 'Snooze'}
		</button>
		<button
			onclick={() => onNudge?.(lead)}
			class="h-[30px] rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 hover:bg-panel-sunken"
		>
			Nudge
		</button>
	</div>
</div>
