<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import type { CalendarEntry } from '$lib/types';

	let {
		entry,
		detailed = false,
		onentryclick
	}: { entry: CalendarEntry; detailed?: boolean; onentryclick?: () => void } = $props();

	// AC4: meeting vs follow-up are visually distinct — blue calendar-dot vs amber clock,
	// distinct border/background classes, plus a machine-readable data-entry-type attribute.
	const isMeeting = $derived(entry.type === 'meeting');
	const isGoLive = $derived(entry.type === 'golive');
	const isEventStart = $derived(entry.type === 'eventstart');
	const isTravel = $derived(entry.type === 'travel');
	const isTeamEvent = $derived(entry.type === 'team-event');

	// B3: text label for the type indicator.
	const typeLabel = $derived(
		isMeeting
			? 'Meeting'
			: isGoLive
				? 'Go-live'
				: isEventStart
					? 'Event Start'
					: isTravel
						? 'Travel'
						: isTeamEvent
							? 'Event'
							: 'Follow-up'
	);
	const iconName = $derived(
		isMeeting
			? 'calendar'
			: isGoLive
				? 'check'
				: isEventStart
					? 'calendarDays'
					: isTravel
						? 'calendar'
						: isTeamEvent
							? 'calendarDays'
							: 'reminders'
	);
	const timeLabel = $derived(
		new Date(entry.startAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
	);

	// Render as a button (opens detail modal) when: a click handler is provided AND the entry
	// has no CRM link. Entries with /leads/ or /meetings/ href navigate directly.
	const asButton = $derived(
		!!onentryclick &&
			!entry.href.includes('/leads/') &&
			!entry.href.includes('/meetings/') &&
			entry.type !== 'followup'
	);

	const chipClass = $derived(
		`rounded-[5px] border-l-2 text-[11px] font-medium transition-colors ${
			isMeeting
				? 'border-l-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
				: isGoLive
					? 'border-l-green-500 bg-green-50 text-green-700 hover:bg-green-100'
					: isEventStart
						? 'border-l-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100'
						: isTravel
							? 'border-l-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-100'
							: isTeamEvent
								? 'border-l-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100'
								: 'border-l-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'
		} ${detailed ? 'flex flex-col gap-0.5 px-1.5 py-1' : 'flex items-center gap-1 truncate px-1.5 py-0.5'}`
	);

	const badgeClass = $derived(
		`rounded-[3px] px-1 font-mono text-[9px] uppercase tracking-[0.4px] ${
			isMeeting
				? 'bg-blue-100 text-blue-700'
				: isGoLive
					? 'bg-green-100 text-green-700'
					: isEventStart
						? 'bg-purple-100 text-purple-700'
						: isTravel
							? 'bg-sky-100 text-sky-700'
							: isTeamEvent
								? 'bg-violet-100 text-violet-700'
								: 'bg-amber-100 text-amber-700'
		}`
	);
</script>

{#snippet chipContent()}
	{#if detailed}
		<div class="flex items-center gap-1">
			<Icon name={iconName} size={11} />
			<span class={badgeClass}>{typeLabel}</span>
			{#if !isGoLive && !isEventStart && !isTravel && !isTeamEvent}
				<span class="font-mono text-[10px] tabular-nums opacity-80">{timeLabel}</span>
			{/if}
		</div>
		<span class="truncate font-semibold">{entry.title}</span>
		{#if entry.subtitle}
			<span class="truncate text-[10px] font-normal opacity-75">{entry.subtitle}</span>
		{/if}
	{:else}
		<Icon name={iconName} size={11} />
		<span class="sr-only">{typeLabel}:</span>
		<span class="truncate">{entry.title}</span>
	{/if}
{/snippet}

{#if asButton}
	<button
		data-entry-type={entry.type}
		data-testid="calendar-entry"
		title={entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title}
		class="w-full text-left {chipClass}"
		onclick={onentryclick}
	>
		{@render chipContent()}
	</button>
{:else}
	<a
		href={entry.href || '#'}
		data-entry-type={entry.type}
		data-testid="calendar-entry"
		title={entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title}
		class={chipClass}
	>
		{@render chipContent()}
	</a>
{/if}
