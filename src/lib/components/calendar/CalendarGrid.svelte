<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import CalendarEntryChip from './CalendarEntry.svelte';
	import { monthGridDays, weekDays, sameLocalDay, type CalendarView } from '$lib/utils/calendar';
	import type { CalendarEntry } from '$lib/types';

	let {
		view,
		entries,
		visibleDate
	}: {
		view: CalendarView;
		entries: CalendarEntry[];
		visibleDate: Date;
	} = $props();

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const days = $derived(view === 'week' ? weekDays(visibleDate) : monthGridDays(visibleDate));
	const anchorMonth = $derived(visibleDate.getMonth());
	const today = new Date();

	// Group once per `entries` change instead of re-filtering+sorting the full
	// array for every one of the (up to 42) rendered day cells.
	const entriesByDay = $derived.by(() => {
		const sorted = [...entries].sort(
			(a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
		);
		const map = new SvelteMap<string, CalendarEntry[]>();
		for (const entry of sorted) {
			const day = new Date(entry.startAt);
			const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
			const bucket = map.get(key);
			if (bucket) bucket.push(entry);
			else map.set(key, [entry]);
		}
		return map;
	});

	function entriesForDay(day: Date): CalendarEntry[] {
		return entriesByDay.get(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`) ?? [];
	}
</script>

<div
	data-testid="calendar-grid"
	data-view={view}
	class="overflow-hidden rounded-control border border-hairline bg-panel"
>
	<!-- weekday header -->
	<div class="grid grid-cols-7 border-b border-hairline bg-panel-sunken">
		{#each WEEKDAYS as label (label)}
			<div
				class="px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[1px] text-ink-400"
			>
				{label}
			</div>
		{/each}
	</div>

	<!-- day cells -->
	<div class="grid grid-cols-7">
		{#each days as day (day.getTime())}
			{@const inMonth = view === 'week' || day.getMonth() === anchorMonth}
			{@const isToday = sameLocalDay(day, today)}
			{@const dayEntries = entriesForDay(day)}
			<div
				data-testid="calendar-day"
				data-in-month={inMonth}
				class="flex flex-col gap-1 border-b border-r border-hairline p-1.5 {view === 'week'
					? 'min-h-[220px]'
					: 'min-h-[104px]'} {inMonth ? 'bg-panel' : 'bg-panel-sunken/40'}"
			>
				<div class="flex items-center justify-between">
					<span
						class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] {isToday
							? 'bg-primary font-semibold text-white'
							: inMonth
								? 'text-ink-600'
								: 'text-ink-300'}"
					>
						{day.getDate()}
					</span>
				</div>
				<div class="flex flex-col gap-0.5">
					{#each dayEntries as entry (entry.id)}
						<CalendarEntryChip {entry} />
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
