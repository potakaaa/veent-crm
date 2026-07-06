<script lang="ts">
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import FutureEventsBadge from '$lib/components/shared/FutureEventsBadge.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { riskMeta } from '$lib/utils/risk';
	import { formatDate } from '$lib/utils/dates';
	import type { Lead } from '$lib/types';

	let {
		lead,
		onSnooze,
		onNudge,
		snoozing = false,
		showFollowUpMeta = false,
		// No outbound messaging integration yet — caller decides visibility (dev-only by default,
		// wired from each route's server load via the ENVIRENOMENT env var).
		nudgeEnabled = false
	}: {
		lead: Lead;
		onSnooze?: (l: Lead) => void;
		onNudge?: (l: Lead) => void;
		snoozing?: boolean;
		/**
		 * Opt-in (REM-1): render the follow-up due-date + owner-name line and the overdue flag.
		 * Off by default so existing consumers (the Today page) are byte-for-byte unchanged.
		 */
		showFollowUpMeta?: boolean;
		nudgeEnabled?: boolean;
	} = $props();

	const eventLine = $derived(
		lead.eventDate ? `${lead.eventName ?? '—'} · ${lead.eventDate}` : (lead.eventName ?? '—')
	);
	const risk = $derived(riskMeta(lead.urgency));
	const isOverdue = $derived(lead.urgency === 'overdue');
	const dueLabel = $derived(lead.followUpAt ? formatDate(lead.followUpAt) : '—');
	const ownerLabel = $derived(lead.ownerName ?? 'Unassigned');
</script>

<!-- Mobile card layout (<640px) -->
<div
	class="grid grid-cols-[1fr_auto] items-stretch gap-3 border-b border-panel-sunken px-3.5 py-3 last:border-b-0 hover:bg-[#fcfbfd] sm:hidden"
>
	<div class="min-w-0">
		<div class="mb-1.5 flex flex-wrap items-center gap-1.5">
			<PlatformBadge platform={lead.platform} />
			<StageChip stage={lead.stage} />
			<AgeBadge label={lead.age.label} type={lead.age.type} />
			{#if lead.hasFutureEvents}
				<FutureEventsBadge />
			{/if}
		</div>
		<a href="/leads/{lead.id}" class="block min-w-0">
			<div class="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink">
				<span class="truncate">{lead.name}</span>
				{#if lead.siblings}
					<span
						class="shrink-0 rounded-[4px] bg-[rgba(217,119,6,0.1)] px-[5px] py-px font-mono text-[10px] text-stale"
					>
						{lead.siblings} events
					</span>
				{/if}
			</div>
			<div class="mt-1 line-clamp-3 font-mono text-[12px] leading-[1.5] text-ink-400">
				{eventLine}
			</div>
			{#if showFollowUpMeta}
				<div class="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
					{#if isOverdue}
						<span
							class="rounded-[4px] px-[5px] py-px font-semibold text-white"
							style="background:{risk.color}">Overdue</span
						>
					{/if}
					<span class="text-ink-400">Due {dueLabel}</span>
					<span class="text-ink-200">·</span>
					<span class="text-ink-400">{ownerLabel}</span>
				</div>
			{/if}
		</a>
	</div>
	<div class="flex shrink-0 flex-col items-center gap-1 border-l border-hairline pl-3">
		<a
			href="/leads/{lead.id}"
			aria-label="Log touch"
			class="flex h-9 w-14 items-center justify-center rounded-[7px] bg-primary text-white transition-colors duration-200 hover:bg-primary-strong"
		>
			<Icon name="message" size={16} stroke={1.8} />
		</a>
		<div class="flex gap-1">
			<button
				onclick={() => onSnooze?.(lead)}
				disabled={snoozing}
				aria-label={snoozing ? 'Snoozing' : 'Snooze'}
				class="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] border border-hairline bg-panel text-ink-600 transition-colors duration-200 hover:bg-panel-sunken disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Icon name="reminders" size={13} stroke={1.8} />
			</button>
			{#if nudgeEnabled}
				<button
					onclick={() => onNudge?.(lead)}
					aria-label="Nudge"
					class="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] border border-hairline bg-panel text-ink-600 transition-colors duration-200 hover:bg-panel-sunken"
				>
					<Icon name="bell" size={13} stroke={1.8} />
				</button>
			{/if}
		</div>
	</div>
</div>

<!-- Desktop row layout (>=640px) — unchanged from before this redesign -->
<div
	class="hidden min-h-10 items-center gap-3 border-b border-panel-sunken px-3.5 py-[9px] last:border-b-0 hover:bg-[#fcfbfd] sm:flex"
>
	<PlatformBadge platform={lead.platform} />
	<a href="/leads/{lead.id}" class="min-w-0 flex-1">
		<div class="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink">
			<span class="truncate">{lead.name}</span>
			{#if lead.siblings}
				<span
					class="shrink-0 rounded-[4px] bg-[rgba(217,119,6,0.1)] px-[5px] py-px font-mono text-[10px] text-stale"
				>
					{lead.siblings} events
				</span>
			{/if}
		</div>
		<div class="mt-0.5 truncate font-mono text-[12px] text-ink-400">{eventLine}</div>
	</a>
	<div class="flex shrink-0 flex-col items-end gap-1">
		<StageChip stage={lead.stage} />
		<AgeBadge label={lead.age.label} type={lead.age.type} />
		{#if lead.hasFutureEvents}
			<FutureEventsBadge />
		{/if}
	</div>
	{#if showFollowUpMeta}
		<div class="w-[160px] shrink-0 max-[1100px]:hidden">
			<div class="flex items-center gap-1.5">
				{#if isOverdue}
					<span
						class="rounded-[4px] px-[5px] py-px font-mono text-[9px] font-semibold uppercase tracking-[0.5px] text-white"
						style="background:{risk.color}">Overdue</span
					>
				{:else}
					<div class="font-mono text-[9px] uppercase tracking-[0.5px] text-ink-200">due</div>
				{/if}
			</div>
			<div class="text-[12px] font-semibold" style={isOverdue ? `color:${risk.color}` : ''}>
				{dueLabel}
			</div>
			<div class="mt-0.5 truncate font-mono text-[11px] text-ink-400">{ownerLabel}</div>
		</div>
	{:else}
		<div class="w-[150px] shrink-0 max-[1100px]:hidden">
			<div class="font-mono text-[9px] uppercase tracking-[0.5px] text-ink-200">next</div>
			<div class="text-[12px] font-semibold" style="color:{risk.color}">{risk.label}</div>
		</div>
	{/if}
	<div class="flex shrink-0 items-center gap-1.5">
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
		{#if nudgeEnabled}
			<button
				onclick={() => onNudge?.(lead)}
				class="h-[30px] rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 hover:bg-panel-sunken"
			>
				Nudge
			</button>
		{/if}
	</div>
</div>
