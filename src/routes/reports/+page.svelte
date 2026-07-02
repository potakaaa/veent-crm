<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Skeleton } from '$lib/components/shared/skeletons';
	import CalendarHeatmap from '$lib/components/reports/CalendarHeatmap.svelte';
	import MonthCalendar from '$lib/components/reports/MonthCalendar.svelte';
	import { formatMoney } from '$lib/utils/currency';
	import type { HeatmapDay, ReportData, OutreachMetrics } from '$lib/types';

	let { data } = $props();

	// Heatmap state — synced from the streaming server promise, then updated
	// client-side when the metric toggle fires a fetch to /api/reports/heatmap.
	let heatmap = $state<HeatmapDay[]>([]);
	let heatMetric = $state<'event_date' | 'created_at'>('event_date');
	let heatLoading = $state(false);

	$effect(() => {
		heatMetric = data.heatMetric;
		// data.heatmap is a streaming Promise — resolve before syncing state
		Promise.resolve(data.heatmap).then((h) => {
			heatmap = h;
		});
	});

	async function changeMetric(metric: string) {
		const m = metric === 'created_at' ? 'created_at' : ('event_date' as const);
		if (m === heatMetric) return;
		heatLoading = true;
		heatMetric = m;
		try {
			const res = await fetch(`/api/reports/heatmap?metric=${m}`);
			if (res.ok) heatmap = (await res.json()) as HeatmapDay[];
		} finally {
			heatLoading = false;
		}
	}

	// report and outreach kept as stable $state so filter navigations update
	// the outreach card in-place without skeletonizing the pipeline/leaderboard.
	let reportData = $state<ReportData | null>(null);
	let outreachData = $state<OutreachMetrics | null>(null);
	let outreachLoading = $state(false);

	$effect(() => {
		let cancelled = false;
		Promise.resolve(data.report).then((r) => {
			if (!cancelled) reportData = r;
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		let cancelled = false;
		outreachLoading = true;
		Promise.resolve(data.outreach)
			.then((o) => {
				if (!cancelled) {
					outreachData = o;
					outreachLoading = false;
				}
			})
			.catch(() => {
				if (!cancelled) outreachLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	// Outreach filter state — synced from URL params on navigation
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterRepId = $state('');

	$effect(() => {
		filterFrom = data.from ?? '';
		filterTo = data.to ?? '';
		filterRepId = data.repId ?? '';
	});

	const hasFilter = $derived(!!(filterFrom || filterTo || filterRepId));

	function buildQuery(parts: [string, string][]): string {
		const qs = parts
			.filter(([, v]) => v)
			.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
			.join('&');
		return qs ? `?${qs}` : '?';
	}

	async function applyFilters(e: Event) {
		e.preventDefault();
		outreachLoading = true;
		try {
			await goto(
				buildQuery([
					['from', filterFrom],
					['to', filterTo],
					['repId', filterRepId],
					['heatMetric', heatMetric !== 'event_date' ? heatMetric : '']
				]),
				{ keepFocus: true }
			);
		} finally {
			// Reset if goto was a no-op (same URL) or failed; the $effect resets it
			// on a real navigation before this runs, so it's safe to always clear here.
			outreachLoading = false;
		}
	}

	async function clearFilters() {
		filterFrom = '';
		filterTo = '';
		filterRepId = '';
		outreachLoading = true;
		try {
			await goto(buildQuery([['heatMetric', heatMetric !== 'event_date' ? heatMetric : '']]), {
				keepFocus: true
			});
		} finally {
			outreachLoading = false;
		}
	}
</script>

<svelte:head><title>Reports · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Reports"
		subtitle="Pipeline health and rep activity. Deal value is shown per currency — never summed across PHP and SGD."
	>
		{#snippet actions()}
			<a
				href="/api/reports/export?type=won"
				class="inline-flex h-[34px] items-center rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600"
				download
			>
				Won deals CSV
			</a>
			<a
				href="/api/reports/export?type=view"
				class="inline-flex h-[34px] items-center rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600"
				download
			>
				Export view CSV
			</a>
		{/snippet}
	</PageHeader>

	<!-- Outreach metrics filter bar -->
	<form onsubmit={applyFilters} class="mb-[18px] flex flex-wrap items-end gap-2.5">
		<div class="flex flex-col gap-1">
			<label class="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300" for="rpt-from"
				>From</label
			>
			<input
				id="rpt-from"
				type="date"
				bind:value={filterFrom}
				class="h-[34px] rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label class="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300" for="rpt-to"
				>To</label
			>
			<input
				id="rpt-to"
				type="date"
				bind:value={filterTo}
				class="h-[34px] rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label class="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300" for="rpt-rep"
				>Rep</label
			>
			<select
				id="rpt-rep"
				bind:value={filterRepId}
				class="h-[34px] rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
			>
				<option value="">All reps</option>
				{#each data.users as u (u.id)}
					<option value={u.id}>{u.name}</option>
				{/each}
			</select>
		</div>
		<button
			type="submit"
			disabled={outreachLoading}
			class="h-[34px] rounded-control bg-primary px-3.5 font-mono text-[12.5px] font-semibold text-white transition-opacity hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
		>
			{outreachLoading ? 'Applying…' : 'Apply'}
		</button>
		{#if hasFilter}
			<button
				type="button"
				onclick={clearFilters}
				class="h-[34px] rounded-control border border-hairline bg-panel px-3.5 font-mono text-[12.5px] text-ink-600 hover:bg-panel-sunken"
			>
				Clear
			</button>
		{/if}
	</form>

	<!-- Outreach metrics — skeleton only on initial load; dims in-place on filter change -->
	{#if outreachData === null}
		<div class="mb-[18px] rounded-control border border-hairline bg-panel p-5">
			<Skeleton class="mb-4 h-4 w-36" />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{#each Array(3) as _, i (i)}
					<div class="rounded-control border border-hairline bg-panel-sunken p-4">
						<Skeleton class="mb-2 h-3 w-28" />
						<Skeleton class="mb-1.5 h-8 w-16" />
						<Skeleton class="h-3 w-36" />
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div
			class="mb-[18px] rounded-control border border-hairline bg-panel p-5 transition-opacity {outreachLoading
				? 'opacity-50'
				: ''}"
		>
			<div class="mb-4 flex items-center gap-2">
				<span class="text-[14px] font-bold">Outreach metrics</span>
				{#if outreachLoading}
					<span class="font-mono text-[10.5px] text-ink-300">updating…</span>
				{/if}
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div class="rounded-control border border-hairline bg-[#fdf3f2] p-4">
					<div class="font-mono text-[10.5px] uppercase tracking-[0.8px] text-ink-300">
						Leads reached out
					</div>
					<div class="mt-1 font-mono text-[28px] font-semibold tracking-[-1px] tnum text-ink">
						{outreachData.leadsReachedOut}
					</div>
					<div class="mt-0.5 text-[12px] text-ink-400">first reached-out date set</div>
				</div>
				<div class="rounded-control border border-hairline bg-[#fdf3f2] p-4">
					<div class="font-mono text-[10.5px] uppercase tracking-[0.8px] text-ink-300">
						Leads that replied
					</div>
					<div class="mt-1 font-mono text-[28px] font-semibold tracking-[-1px] tnum text-ink">
						{outreachData.leadsThatReplied}
					</div>
					<div class="mt-0.5 text-[12px] text-ink-400">leads with a replied activity</div>
				</div>
				<div class="rounded-control border border-hairline bg-[#fdf3f2] p-4">
					<div class="font-mono text-[10.5px] uppercase tracking-[0.8px] text-ink-300">
						Leads with meeting
					</div>
					<div class="mt-1 font-mono text-[28px] font-semibold tracking-[-1px] tnum text-ink">
						{outreachData.leadsWithMeeting}
					</div>
					<div class="mt-0.5 text-[12px] text-ink-400">at least one meeting logged</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Pipeline funnel + leaderboard + won deals — skeleton only on initial load, never re-skeletons on filter change -->
	{#if reportData === null}
		<div class="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.1fr_1fr]">
			<div class="rounded-control border border-hairline bg-panel p-5">
				<Skeleton class="mb-4 h-4 w-32" />
				<div class="space-y-3">
					{#each Array(6) as _, i (i)}
						<div>
							<div class="mb-1 flex items-center justify-between">
								<Skeleton class="h-3 w-24" />
								<Skeleton class="h-3 w-16" />
							</div>
							<Skeleton class="h-[22px] w-full rounded-[5px]" />
						</div>
					{/each}
				</div>
			</div>
			<div class="rounded-control border border-hairline bg-panel p-5">
				<Skeleton class="mb-4 h-4 w-32" />
				<div class="space-y-2.5">
					{#each Array(4) as _, i (i)}
						<Skeleton class="h-[26px] w-full rounded-[5px]" />
					{/each}
				</div>
			</div>
		</div>
		<div class="rounded-control border border-hairline bg-panel p-5">
			<Skeleton class="mb-4 h-4 w-40" />
			<div class="flex flex-wrap gap-4">
				{#each Array(2) as _, i (i)}
					<div
						class="min-w-[200px] flex-1 rounded-control border border-hairline bg-panel-sunken p-4"
					>
						<Skeleton class="mb-2 h-3 w-16" />
						<Skeleton class="mb-1.5 h-8 w-32" />
						<Skeleton class="h-3 w-24" />
					</div>
				{/each}
			</div>
		</div>
	{:else}
		{@const maxCount = Math.max(...reportData.funnel.map((f) => f.count), 1)}
		{@const maxTouches = Math.max(...reportData.leaderboard.map((r) => r.touches), 1)}

		<!-- Pipeline funnel + rep leaderboard -->
		<div class="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.1fr_1fr]">
			<div class="rounded-control border border-hairline bg-panel p-5">
				<div class="mb-4 flex items-center justify-between">
					<div class="text-[14px] font-bold">Pipeline funnel</div>
					<span class="font-mono text-[11px] text-fresh"
						>{reportData.conversionRate}% new → won</span
					>
				</div>
				{#each reportData.funnel as f (f.stage)}
					<div class="mb-3">
						<div class="mb-1 flex items-center justify-between">
							<span class="flex items-center gap-[7px] text-[12.5px] font-medium text-ink">
								<span class="h-2 w-2 rounded-full" style="background:{f.color}"></span>{f.label}
							</span>
							<span class="font-mono text-[12px] text-ink-600">{f.count} · {f.pct}%</span>
						</div>
						<div class="h-[22px] overflow-hidden rounded-[5px] bg-panel-sunken">
							<div
								class="h-full rounded-[5px]"
								style="width:{Math.round((f.count / maxCount) * 100)}%;background:{f.color}"
							></div>
						</div>
					</div>
				{/each}
			</div>

			<div class="flex flex-col rounded-control border border-hairline bg-panel p-5">
				<div class="mb-4 text-[14px] font-bold">Rep leaderboard</div>
				{#if reportData.leaderboard.length === 0}
					<!-- C2: empty-state messaging for a leaderboard with no reps/activity yet. -->
					<div data-testid="leaderboard-empty-state">
						<EmptyState
							title="No rep activity yet"
							hint="Once your team logs touches and closes deals, the leaderboard will populate here."
						/>
					</div>
				{/if}
				{#if reportData.leaderboard.length > 0}
					<div class="mb-5 space-y-[7px]">
						{#each reportData.leaderboard as r (r.repId)}
							<div class="flex items-center gap-3">
								<div class="w-[72px] shrink-0 truncate text-right text-[11.5px] text-ink-500">
									{r.name.split(' ')[0]}
								</div>
								<div class="relative min-w-0 flex-1">
									<div class="h-[26px] w-full overflow-hidden rounded-[5px] bg-panel-sunken">
										{#if r.touches > 0}
											<div
												class="flex h-full items-center rounded-[5px] bg-[#6366f1] pl-2.5 transition-all"
												style="width:{Math.max((r.touches / maxTouches) * 100, 8)}%"
											>
												<span
													class="truncate pr-2 font-mono text-[10.5px] font-medium text-white/90"
												>
													{r.name.split(' ')[0]}
												</span>
											</div>
										{/if}
									</div>
								</div>
								<div class="flex w-[52px] shrink-0 items-center gap-1.5">
									<span class="font-mono text-[12.5px] text-ink-500">{r.touches || '—'}</span>
									{#if r.wins > 0}
										<span
											class="rounded-[3px] bg-[#22c55e]/15 px-1 font-mono text-[9.5px] font-semibold text-[#16a34a]"
										>
											{r.wins}W
										</span>
									{/if}
								</div>
							</div>
						{/each}
						<div class="flex items-center gap-4 pt-1 text-[11px] text-ink-300">
							<span class="flex items-center gap-1.5">
								<span class="inline-block h-[9px] w-[9px] rounded-[2px] bg-[#6366f1]"></span>Touches
							</span>
							<span class="flex items-center gap-1.5">
								<span class="inline-block h-[9px] w-[9px] rounded-[2px] bg-[#22c55e]"></span>Wins
							</span>
						</div>
					</div>
				{/if}
				{#if reportData.leaderboard.length > 0}
					<div
						class="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr] gap-2 border-b border-hairline pb-2 font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300"
					>
						<span>Rep</span><span class="text-right">Touches</span><span class="text-right"
							>Replies</span
						><span class="text-right">Wins</span>
					</div>
				{/if}
				{#each reportData.leaderboard as r (r.repId)}
					<div
						class="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr] items-center gap-2 border-b border-panel-sunken py-2 last:border-b-0"
					>
						<div class="flex min-w-0 items-center gap-2">
							<Avatar name={r.name} />
							<span class="truncate text-[13px] font-semibold">{r.name}</span>
						</div>
						<span class="text-right font-mono text-[13px]">{r.touches || '—'}</span>
						<span class="text-right font-mono text-[13px] text-fresh">{r.replies || '—'}</span>
						<span
							class="text-right font-mono text-[13px] font-bold {r.wins > 0
								? 'text-ink'
								: 'text-ink-300'}">{r.wins || '—'}</span
						>
					</div>
				{/each}
			</div>
		</div>

		<!-- Won deals by currency -->
		<div class="rounded-control border border-hairline bg-panel p-5">
			<div class="mb-3.5 flex items-center justify-between">
				<div class="text-[14px] font-bold">Won deals — by currency</div>
				<span class="text-[11.5px] text-ink-200"
					>manually captured in Veent · never read from external systems</span
				>
			</div>
			<div class="flex flex-wrap gap-4">
				{#each reportData.currencyTotals as c (c.currency)}
					<div class="min-w-[200px] flex-1 rounded-control border border-hairline bg-[#fdf3f2] p-4">
						<div class="font-mono text-[11px] tracking-[1px] text-ink-300">{c.label}</div>
						<div class="mt-1 font-mono text-[26px] font-semibold tracking-[-1px] tnum">
							{formatMoney(c.total, c.currency)}
						</div>
						<div class="mt-0.5 text-[12.5px] text-ink-500">{c.deals} won deals</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Calendar views — below all summary cards -->
	<div class="mt-[18px] flex flex-col gap-[18px]">
		<MonthCalendar data={heatmap} metric={heatMetric} />
		<CalendarHeatmap
			data={heatmap}
			metric={heatMetric}
			loading={heatLoading}
			onchange={changeMetric}
		/>
	</div>
</div>
