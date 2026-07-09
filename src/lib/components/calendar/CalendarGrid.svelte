<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import * as Popover from '$lib/components/ui/popover';
	import CalendarEntryChip from './CalendarEntry.svelte';
	import { monthGridDays, weekDays, sameLocalDay, type CalendarView } from '$lib/utils/calendar';
	import type { CalendarEntry } from '$lib/types';

	let {
		view,
		entries,
		visibleDate,
		onentryclick = undefined
	}: {
		view: CalendarView;
		entries: CalendarEntry[];
		visibleDate: Date;
		onentryclick?: (entry: CalendarEntry) => void;
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

	// C1: cap the entries rendered inline per day cell; the rest go behind a "+N more"
	// popover (NOT a scrollable cell — avoids the nested-scroll mobile anti-pattern).
	// Week cells are taller (min-h-[220px]) so they fit more before overflowing.
	const VISIBLE_THRESHOLD = $derived(view === 'week' ? 6 : 3);
</script>

<!-- B1: on narrow screens the 7-column grid would crush each day cell, so the grid keeps
     a usable min-width and the wrapper scrolls horizontally instead (sm+ shows it in full). -->
<div class="overflow-x-auto rounded-control border border-hairline bg-panel">
	<div
		data-testid="calendar-grid"
		data-view={view}
		role="grid"
		aria-label="Calendar"
		class="min-w-[640px] overflow-hidden sm:min-w-0"
	>
		<!-- weekday header -->
		<div class="grid grid-cols-7 border-b border-hairline bg-panel-sunken" role="row">
			{#each WEEKDAYS as label (label)}
				<div
					role="columnheader"
					class="px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[1px] text-ink-400"
				>
					{label}
				</div>
			{/each}
		</div>

		<!-- day cells -->
		<div class="grid grid-cols-7" role="rowgroup">
			{#each days as day (day.getTime())}
				{@const inMonth = view === 'week' || day.getMonth() === anchorMonth}
				{@const isToday = sameLocalDay(day, today)}
				{@const dayEntries = entriesForDay(day)}
				{@const visibleEntries = dayEntries.slice(0, VISIBLE_THRESHOLD)}
				{@const overflowEntries = dayEntries.slice(VISIBLE_THRESHOLD)}
				<div
					data-testid="calendar-day"
					data-in-month={inMonth}
					role="gridcell"
					aria-label={day.toLocaleDateString('en-PH', {
						weekday: 'long',
						month: 'long',
						day: 'numeric'
					})}
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
						{#each visibleEntries as entry (entry.id)}
							<CalendarEntryChip
								{entry}
								detailed={view === 'week'}
								onentryclick={onentryclick ? () => onentryclick(entry) : undefined}
							/>
						{/each}
						{#if overflowEntries.length > 0}
							<Popover.Root>
								<Popover.Trigger
									data-testid="calendar-more-trigger"
									class="focus-ring rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-medium text-ink-500 hover:bg-panel-sunken"
								>
									+{overflowEntries.length} more
								</Popover.Trigger>
								<Popover.Content
									align="start"
									data-testid="calendar-more-content"
									class="flex max-h-72 w-56 flex-col gap-0.5 overflow-y-auto"
								>
									{#each overflowEntries as entry (entry.id)}
										<CalendarEntryChip
											{entry}
											detailed
											onentryclick={onentryclick ? () => onentryclick(entry) : undefined}
										/>
									{/each}
								</Popover.Content>
							</Popover.Root>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
