<script lang="ts">
	import type { HeatmapDay } from '$lib/types';

	let {
		data,
		metric = 'event_date'
	}: { data: HeatmapDay[]; metric?: 'event_date' | 'created_at' } = $props();

	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const STAGE_COLORS: Record<string, string> = {
		new: '#6366f1',
		contacted: '#f59e0b',
		replied: '#3b82f6',
		in_discussion: '#8b5cf6',
		won: '#22c55e',
		lost: '#ef4444'
	};
	const STAGE_LABELS: Record<string, string> = {
		new: 'New',
		contacted: 'Contacted',
		replied: 'Replied',
		in_discussion: 'In discussion',
		won: 'Won',
		lost: 'Lost'
	};

	// Start at the current month
	const now = new Date();
	let year = $state(now.getFullYear());
	let month = $state(now.getMonth()); // 0-indexed

	const dayMap = $derived(new Map<string, HeatmapDay>(data.map((d) => [d.date, d])));

	// Build the 6-row × 7-col grid for the displayed month
	const calendarWeeks = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const first = new Date(year, month, 1);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const last = new Date(year, month + 1, 0);

		// Monday-aligned: offset of the first day
		const startDow = first.getDay(); // 0=Sun
		const leadingEmpties = startDow === 0 ? 6 : startDow - 1;

		const weeks: Array<Array<{ date: string | null; day: HeatmapDay | null }>> = [];
		let cells: Array<{ date: string | null; day: HeatmapDay | null }> = [];

		// Leading empty cells
		for (let i = 0; i < leadingEmpties; i++) cells.push({ date: null, day: null });

		// Fill month days
		for (let d = 1; d <= last.getDate(); d++) {
			const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({ date: dateStr, day: dayMap.get(dateStr) ?? null });
			if (cells.length === 7) {
				weeks.push(cells);
				cells = [];
			}
		}

		// Trailing empty cells to fill the last row
		if (cells.length > 0) {
			while (cells.length < 7) cells.push({ date: null, day: null });
			weeks.push(cells);
		}

		// Pad to always render 6 rows so the card height is stable month-to-month
		while (weeks.length < 6) weeks.push(Array(7).fill({ date: null, day: null }));

		return weeks;
	});

	function prevMonth() {
		if (month === 0) {
			month = 11;
			year -= 1;
		} else {
			month -= 1;
		}
	}

	function nextMonth() {
		if (month === 11) {
			month = 0;
			year += 1;
		} else {
			month += 1;
		}
	}

	function densityBg(total: number): string {
		if (total === 0) return '';
		if (total <= 2) return 'bg-primary/15';
		if (total <= 5) return 'bg-primary/35';
		if (total <= 10) return 'bg-primary/60';
		return 'bg-primary/85';
	}

	function densityText(total: number): string {
		if (total <= 5) return 'text-ink';
		return 'text-white';
	}

	// Tooltip
	let tooltip = $state<{ day: HeatmapDay; x: number; y: number } | null>(null);

	function showTooltip(e: MouseEvent, day: HeatmapDay) {
		tooltip = { day, x: e.clientX, y: e.clientY };
	}

	function hideTooltip() {
		tooltip = null;
	}

	function formatDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
</script>

<div class="rounded-control border border-hairline bg-panel p-5">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<div class="text-[14px] font-bold">{MONTH_NAMES[month]} {year}</div>
		<div class="flex items-center gap-1">
			<button
				onclick={prevMonth}
				class="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-hairline bg-panel text-ink-600 hover:bg-panel-sunken"
				aria-label="Previous month"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg
				>
			</button>
			<button
				onclick={nextMonth}
				class="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-hairline bg-panel text-ink-600 hover:bg-panel-sunken"
				aria-label="Next month"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg
				>
			</button>
		</div>
	</div>

	<!-- Day-of-week header -->
	<div class="mb-1 grid grid-cols-7 gap-1">
		{#each DAY_HEADERS as h (h)}
			<div class="py-1 text-center font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300">
				{h}
			</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="grid gap-1">
		{#each calendarWeeks as week, wi (wi)}
			<div class="grid grid-cols-7 gap-1">
				{#each week as cell, di (di)}
					{#if cell.date === null}
						<div class="min-h-[80px] rounded-[6px]"></div>
					{:else}
						{#if cell.day && cell.day.total > 0}
							<a
								href="/leads?date={cell.date}&dateField={metric}&segment=all"
								class="relative flex min-h-[80px] flex-col items-start justify-start rounded-[6px] p-2 {densityBg(
									cell.day.total
								)} {cell.date === todayStr
									? 'ring-2 ring-primary ring-offset-1'
									: ''} cursor-pointer transition-opacity hover:opacity-80"
								onmouseenter={(e) => showTooltip(e, cell.day!)}
								onmouseleave={hideTooltip}
							>
								<span class="font-mono text-[12px] font-semibold {densityText(cell.day.total)}">
									{cell.date.split('-')[2].replace(/^0/, '')}
								</span>
								<span class="mt-auto font-mono text-[13px] font-bold {densityText(cell.day.total)}">
									{cell.day.total}
								</span>
							</a>
						{:else}
							<div
								class="relative flex min-h-[80px] flex-col items-start justify-start rounded-[6px] border border-hairline/40 bg-panel-sunken/50 p-2 {cell.date ===
								todayStr
									? 'ring-2 ring-primary ring-offset-1'
									: ''}"
							>
								<span class="font-mono text-[12px] font-semibold text-ink-400">
									{cell.date.split('-')[2].replace(/^0/, '')}
								</span>
							</div>
						{/if}
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>

<!-- Tooltip -->
{#if tooltip}
	<div
		class="pointer-events-none fixed z-50 rounded-control border border-hairline bg-panel p-2.5 shadow-md"
		style="left: {tooltip.x + 12}px; top: {tooltip.y - 8}px; transform: translateY(-100%);"
	>
		<div class="mb-1.5 font-mono text-[11px] font-semibold text-ink">
			{formatDate(tooltip.day.date)}
		</div>
		<div class="mb-2 text-[12px] text-ink-600">
			{tooltip.day.total} lead{tooltip.day.total === 1 ? '' : 's'}
		</div>
		<div class="flex flex-wrap gap-1">
			{#each Object.entries(tooltip.day.stages) as [stage, cnt] (stage)}
				<span
					class="inline-flex items-center gap-1 rounded-[4px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium text-white"
					style="background: {STAGE_COLORS[stage] ?? '#94a3b8'}"
				>
					{cnt}
					{STAGE_LABELS[stage] ?? stage}
				</span>
			{/each}
		</div>
	</div>
{/if}
