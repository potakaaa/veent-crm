<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import {
		parseDateParam,
		shiftDate,
		toDateParam,
		weekDays,
		type CalendarView
	} from '$lib/utils/calendar';

	let { data } = $props();

	const view = $derived(data.view as CalendarView);
	const anchor = $derived(parseDateParam(data.date));

	// Query-param navigations (prev/next/today/view toggle) keep the same pathname, so the
	// global cross-route progress bar in +layout.svelte doesn't fire for them (per-page
	// navLoading handles same-route changes, same convention as leads/pipeline/unassigned).
	const navLoading = $derived(navigating.to?.url.pathname === '/calendar');
	// Tracks which control was pressed so only that one shows a spinner (rest just disable).
	let pendingAction = $state<'prev' | 'next' | 'today' | 'month' | 'week' | null>(null);
	$effect(() => {
		if (!navLoading) pendingAction = null;
	});

	// Month view labels the anchor's month; week view labels the actual Sun→Sat
	// span rendered by CalendarGrid (same weekDays() call), not just the anchor day.
	const rangeLabel = $derived.by(() => {
		if (view !== 'week') {
			return anchor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
		}
		const [start, end] = [weekDays(anchor)[0], weekDays(anchor)[6]];
		const startLabel = start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
		const endLabel = end.toLocaleDateString(
			'en-PH',
			start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' }
		);
		return `${startLabel}–${endLabel}, ${end.getFullYear()}`;
	});

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
		pendingAction = v;
		navigate({ view: v === 'month' ? undefined : v });
	}

	function step(dir: 'prev' | 'next') {
		pendingAction = dir;
		navigate({ date: toDateParam(shiftDate(view, anchor, dir)) });
	}

	function goToday() {
		pendingAction = 'today';
		navigate({ date: undefined });
	}
</script>

{#snippet spinner(size: number)}
	<svg
		class="shrink-0 animate-spin"
		style="width:{size}px;height:{size}px"
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
		></circle>
		<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
		></path>
	</svg>
{/snippet}

<svelte:head><title>Calendar · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="Calendar" subtitle="Team meetings and your follow-ups on one grid.">
		{#snippet actions()}
			<div
				class="flex rounded-control bg-panel-sunken p-[3px]"
				data-testid="calendar-view-toggle"
				aria-busy={navLoading}
			>
				<button
					data-testid="calendar-view-month"
					onclick={() => setView('month')}
					aria-pressed={view === 'month'}
					disabled={navLoading}
					class="flex h-[26px] items-center gap-1.5 rounded-[6px] px-3 text-[12.5px] disabled:cursor-wait {view ===
					'month'
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					{#if navLoading && pendingAction === 'month'}{@render spinner(11)}{/if}
					Month
				</button>
				<button
					data-testid="calendar-view-week"
					onclick={() => setView('week')}
					aria-pressed={view === 'week'}
					disabled={navLoading}
					class="flex h-[26px] items-center gap-1.5 rounded-[6px] px-3 text-[12.5px] disabled:cursor-wait {view ===
					'week'
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					{#if navLoading && pendingAction === 'week'}{@render spinner(11)}{/if}
					Week
				</button>
			</div>
		{/snippet}
	</PageHeader>

	<div class="mb-3.5 flex items-center gap-2.5">
		<button
			data-testid="calendar-prev"
			onclick={() => step('prev')}
			disabled={navLoading}
			class="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-panel text-ink-500 hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
			aria-label="Previous"
		>
			{#if navLoading && pendingAction === 'prev'}{@render spinner(15)}{:else}<Icon
					name="back"
					size={15}
				/>{/if}
		</button>
		<button
			data-testid="calendar-next"
			onclick={() => step('next')}
			disabled={navLoading}
			class="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-panel text-ink-500 hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
			aria-label="Next"
		>
			{#if navLoading && pendingAction === 'next'}{@render spinner(15)}{:else}<span
					class="rotate-180"><Icon name="back" size={15} /></span
				>{/if}
		</button>
		<button
			onclick={goToday}
			disabled={navLoading}
			class="flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-500 hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
		>
			{#if navLoading && pendingAction === 'today'}{@render spinner(12)}{/if}
			Today
		</button>
		<div
			class="ml-1 flex items-center gap-2 text-[14px] font-semibold text-ink"
			data-testid="calendar-range-label"
			aria-busy={navLoading}
		>
			{rangeLabel}
			{#if navLoading}
				<span class="text-ink-400">{@render spinner(13)}</span>
			{/if}
		</div>
	</div>

	<div class="mb-3 flex items-center gap-2.5" aria-label="Calendar legend">
		{#each [{ label: 'Meeting', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' }, { label: 'Follow-up', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' }, { label: 'Sale Opens', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' }, { label: 'Event Start', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' }] as item}
			<span
				class="flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium {item.bg} {item.text}"
			>
				<span class="h-1.5 w-1.5 rounded-full {item.dot}"></span>
				{item.label}
			</span>
		{/each}
	</div>

	<div class={navLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
		<CalendarGrid {view} entries={data.entries} visibleDate={anchor} />
		{#if data.entries.length === 0}
			<!-- C2: empty-state messaging for a {view} with no meetings or follow-ups. The grid
			     above still renders (AC9) — this is an additive "no data yet" cue below it. -->
			<div data-testid="calendar-empty-state" class="mt-4">
				<EmptyState
					title="No meetings or follow-ups {view === 'week' ? 'this week' : 'this month'}"
					hint="Scheduled meetings and lead follow-ups will appear on this grid."
				/>
			</div>
		{/if}
	</div>
</div>
