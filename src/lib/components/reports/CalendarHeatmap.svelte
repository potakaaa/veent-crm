<script lang="ts">
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { navigating } from '$app/state';
	import type { HeatmapDay } from '$lib/types';

	let {
		data,
		metric,
		onchange
	}: {
		data: HeatmapDay[];
		metric: 'event_date' | 'created_at';
		onchange: (m: string) => void;
	} = $props();

	// --- Grid construction ---------------------------------------------------

	const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
	const MONTH_NAMES = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

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

	function toDateStr(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function densityClass(total: number): string {
		if (total === 0) return 'bg-panel-sunken';
		if (total <= 2) return 'bg-primary/20';
		if (total <= 5) return 'bg-primary/40';
		if (total <= 10) return 'bg-primary/70';
		return 'bg-primary';
	}

	const grid = $derived.by(() => {
		// Build a lookup map
		const map = new Map<string, HeatmapDay>(data.map((d) => [d.date, d]));

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// event_date: start TODAY (forward-looking — upcoming events)
		// created_at: start 52 weeks ago (backward-looking — creation history)
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const start = new Date(today);
		if (metric === 'created_at') start.setDate(start.getDate() - 364);

		// Align to Monday of the start week (getDay: 0=Sun, 1=Mon … 6=Sat)
		const dow = start.getDay();
		const offset = dow === 0 ? 6 : dow - 1;
		start.setDate(start.getDate() - offset);

		const weeks: Array<Array<{ date: string; day: HeatmapDay | null }>> = [];
		const monthLabels: Array<{ label: string; col: number }> = [];

		let lastMonth = -1;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const cur = new Date(start);

		for (let w = 0; w < 53; w++) {
			const week: Array<{ date: string; day: HeatmapDay | null }> = [];
			for (let d = 0; d < 7; d++) {
				const dateStr = toDateStr(cur);
				week.push({ date: dateStr, day: map.get(dateStr) ?? null });
				// Track month label at the first day of a new month appearing on Mon
				if (d === 0) {
					const m = cur.getMonth();
					if (m !== lastMonth) {
						monthLabels.push({ label: MONTH_NAMES[m], col: w });
						lastMonth = m;
					}
				}
				cur.setDate(cur.getDate() + 1);
			}
			weeks.push(week);
		}

		return { weeks, monthLabels };
	});

	// --- Tooltip state -------------------------------------------------------

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
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const navLoading = $derived(navigating.to?.url.pathname === '/reports');
</script>

<div class="rounded-control border border-hairline bg-panel p-5">
	<div class="mb-4 flex items-center justify-between">
		<div class="text-[14px] font-bold">Lead density by date</div>
		<Select type="single" value={metric} onValueChange={(v) => onchange(v as string)}>
			<SelectTrigger
				class="h-[30px] w-[140px] rounded-control border border-hairline bg-panel px-3 font-sans text-[12.5px] text-ink-600"
			>
				{metric === 'event_date' ? 'Event date' : 'Created date'}
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="event_date" label="Event date">Event date</SelectItem>
				<SelectItem value="created_at" label="Created date">Created date</SelectItem>
			</SelectContent>
		</Select>
	</div>

	{#if navLoading}
		<Skeleton class="h-[120px] w-full rounded-control" />
	{:else}
		<div class="flex min-w-0 gap-1.5">
			<!-- Day labels (left) -->
			<div class="flex shrink-0 flex-col gap-px pt-5">
				{#each DAY_LABELS as label, i (i)}
					<div class="flex h-[12px] items-center font-mono text-[9.5px] text-ink-300">
						{label}
					</div>
				{/each}
			</div>

			<!-- Weeks grid -->
			<div class="min-w-0 flex-1">
				<!-- Month labels row -->
				<div class="relative mb-1 h-5">
					{#each grid.monthLabels as ml (ml.col)}
						<span
							class="absolute font-mono text-[10px] text-ink-400"
							style="left: {((ml.col / grid.weeks.length) * 100).toFixed(2)}%"
						>
							{ml.label}
						</span>
					{/each}
				</div>

				<!-- Cell grid -->
				<div
					class="grid gap-px"
					style="grid-template-columns: repeat({grid.weeks
						.length}, 1fr); grid-template-rows: repeat(7, 12px);"
				>
					{#each grid.weeks as week, wi (wi)}
						{#each week as cell, di (di)}
							{#if cell.day}
								<a
									href="/leads?date={cell.date}&dateField={metric}&segment=all"
									class="rounded-[2px] {densityClass(
										cell.day.total
									)} transition-opacity hover:opacity-70"
									style="grid-column: {wi + 1}; grid-row: {di + 1};"
									onmouseenter={(e) => showTooltip(e, cell.day!)}
									onmouseleave={hideTooltip}
									aria-label="{cell.date}: {cell.day.total} leads"
								></a>
							{:else}
								<div
									class="rounded-[2px] {densityClass(0)}"
									style="grid-column: {wi + 1}; grid-row: {di + 1};"
									aria-label={cell.date}
								></div>
							{/if}
						{/each}
					{/each}
				</div>
			</div>
		</div>

		<!-- Legend -->
		<div class="mt-3 flex items-center gap-3 text-[11px] text-ink-300">
			<span>Less</span>
			<div class="flex gap-[3px]">
				<div
					class="h-[10px] w-[10px] rounded-[2px] bg-panel-sunken border border-hairline/50"
				></div>
				<div class="h-[10px] w-[10px] rounded-[2px] bg-primary/20"></div>
				<div class="h-[10px] w-[10px] rounded-[2px] bg-primary/40"></div>
				<div class="h-[10px] w-[10px] rounded-[2px] bg-primary/70"></div>
				<div class="h-[10px] w-[10px] rounded-[2px] bg-primary"></div>
			</div>
			<span>More</span>
		</div>
	{/if}
</div>

<!-- Floating tooltip (single instance for all cells) -->
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
