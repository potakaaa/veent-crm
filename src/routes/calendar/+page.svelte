<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { parseDateParam, shiftDate, toDateParam, type CalendarView } from '$lib/utils/calendar';

	let { data } = $props();

	const view = $derived(data.view as CalendarView);
	const anchor = $derived(parseDateParam(data.date));

	const rangeLabel = $derived(
		anchor.toLocaleDateString('en-PH', {
			month: 'long',
			year: 'numeric',
			...(view === 'week' ? { day: 'numeric' } : {})
		})
	);

	// Same URL-param navigate() convention as src/routes/leads/+page.svelte.
	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '') params.delete(k);
			else params.set(k, String(v));
		}
		goto(`?${params}`, { keepFocus: true });
	}

	// AC7 + AC8: switching view keeps the same `date` anchor (which is contained in both
	// the month and week windows), so the user stays oriented — never reset to today.
	function setView(v: CalendarView) {
		navigate({ view: v === 'month' ? undefined : v });
	}

	function step(dir: 'prev' | 'next') {
		navigate({ date: toDateParam(shiftDate(view, anchor, dir)) });
	}

	function goToday() {
		navigate({ date: undefined });
	}
</script>

<svelte:head><title>Calendar · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="Calendar" subtitle="Team meetings and your follow-ups on one grid.">
		{#snippet actions()}
			<div class="flex rounded-control bg-panel-sunken p-[3px]" data-testid="calendar-view-toggle">
				<button
					data-testid="calendar-view-month"
					onclick={() => setView('month')}
					class="h-[26px] rounded-[6px] px-3 text-[12.5px] {view === 'month'
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					Month
				</button>
				<button
					data-testid="calendar-view-week"
					onclick={() => setView('week')}
					class="h-[26px] rounded-[6px] px-3 text-[12.5px] {view === 'week'
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					Week
				</button>
			</div>
		{/snippet}
	</PageHeader>

	<div class="mb-3.5 flex items-center gap-2.5">
		<button
			data-testid="calendar-prev"
			onclick={() => step('prev')}
			class="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-panel text-ink-500 hover:bg-panel-sunken"
			aria-label="Previous"
		>
			<Icon name="back" size={15} />
		</button>
		<button
			data-testid="calendar-next"
			onclick={() => step('next')}
			class="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-panel text-ink-500 hover:bg-panel-sunken"
			aria-label="Next"
		>
			<span class="rotate-180"><Icon name="back" size={15} /></span>
		</button>
		<button
			onclick={goToday}
			class="h-8 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-500 hover:bg-panel-sunken"
		>
			Today
		</button>
		<div class="ml-1 text-[14px] font-semibold text-ink" data-testid="calendar-range-label">
			{rangeLabel}
		</div>
	</div>

	<CalendarGrid {view} entries={data.entries} visibleDate={anchor} />
</div>
