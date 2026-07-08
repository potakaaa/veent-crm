<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import type { CalendarEntry } from '$lib/types';

	let { entry, detailed = false }: { entry: CalendarEntry; detailed?: boolean } = $props();

	// AC4: meeting vs follow-up are visually distinct — blue calendar-dot vs amber clock,
	// distinct border/background classes, plus a machine-readable data-entry-type attribute.
	const isMeeting = $derived(entry.type === 'meeting');
	const isGoLive = $derived(entry.type === 'golive');
	const isEventStart = $derived(entry.type === 'eventstart');
	// B3: text label for the meeting/follow-up/go-live/event-start type indicator (previously colour+icon only).
	const typeLabel = $derived(
		isMeeting ? 'Meeting' : isGoLive ? 'Go-live' : isEventStart ? 'Event Start' : 'Follow-up'
	);
	const iconName = $derived(
		isMeeting ? 'calendar' : isGoLive ? 'check' : isEventStart ? 'calendarDays' : 'reminders'
	);
	const timeLabel = $derived(
		new Date(entry.startAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
	);
</script>

<a
	href={entry.href}
	data-entry-type={entry.type}
	data-testid="calendar-entry"
	title={entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title}
	class="rounded-[5px] border-l-2 text-[11px] font-medium transition-colors {isMeeting
		? 'border-l-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
		: isGoLive
			? 'border-l-green-500 bg-green-50 text-green-700 hover:bg-green-100'
			: isEventStart
				? 'border-l-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100'
				: 'border-l-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'} {detailed
		? 'flex flex-col gap-0.5 px-1.5 py-1'
		: 'flex items-center gap-1 truncate px-1.5 py-0.5'}"
>
	{#if detailed}
		<div class="flex items-center gap-1">
			<Icon name={iconName} size={11} />
			<span
				class="rounded-[3px] px-1 font-mono text-[9px] uppercase tracking-[0.4px] {isMeeting
					? 'bg-blue-100 text-blue-700'
					: isGoLive
						? 'bg-green-100 text-green-700'
						: isEventStart
							? 'bg-purple-100 text-purple-700'
							: 'bg-amber-100 text-amber-700'}">{typeLabel}</span
			>
			{#if !isGoLive && !isEventStart}
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
</a>
