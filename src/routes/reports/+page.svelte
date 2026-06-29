<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import { formatMoney } from '$lib/utils/currency';
	import type { FunnelStage } from '$lib/types';

	let { data } = $props();
	const report = $derived(data.report);
	const maxCount = $derived(Math.max(...report.funnel.map((f: FunnelStage) => f.count), 1));
</script>

<svelte:head><title>Reports · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Reports"
		subtitle="Pipeline health and rep activity. Deal value is shown per currency — never summed across PHP and SGD."
	>
		{#snippet actions()}
			<button
				class="h-[34px] rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600"
			>
				1 Mar – 24 Jun 2026 ▾
			</button>
		{/snippet}
	</PageHeader>

	<div class="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.1fr_1fr]">
		<!-- funnel -->
		<div class="rounded-control border border-hairline bg-panel p-5">
			<div class="mb-4 flex items-center justify-between">
				<div class="text-[14px] font-bold">Pipeline funnel</div>
				<span class="font-mono text-[11px] text-fresh">{report.conversionRate}% new → won</span>
			</div>
			{#each report.funnel as f (f.stage)}
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

		<!-- leaderboard -->
		<div class="rounded-control border border-hairline bg-panel p-5">
			<div class="mb-4 text-[14px] font-bold">Rep leaderboard</div>
			<div
				class="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-2 border-b border-hairline pb-2.5 font-mono text-[10px] uppercase tracking-[0.4px] text-ink-300"
			>
				<span>Rep</span><span class="text-right">Touches</span><span class="text-right"
					>Replies</span
				><span class="text-right">Wins</span>
			</div>
			{#each report.leaderboard as r (r.repId)}
				<div
					class="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-2 border-b border-panel-sunken py-2.5 last:border-b-0"
				>
					<div class="flex items-center gap-2">
						<Avatar name={r.name} /><span class="text-[13px] font-semibold">{r.name}</span>
					</div>
					<span class="text-right font-mono text-[13px]">{r.touches}</span>
					<span class="text-right font-mono text-[13px] text-fresh">{r.replies}</span>
					<span class="text-right font-mono text-[13px] font-semibold">{r.wins}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- won deals by currency -->
	<div class="rounded-control border border-hairline bg-panel p-5">
		<div class="mb-3.5 flex items-center justify-between">
			<div class="text-[14px] font-bold">Won deals — by currency</div>
			<span class="text-[11.5px] text-ink-200"
				>manually captured in Veent · never read from external systems</span
			>
		</div>
		<div class="flex flex-wrap gap-4">
			{#each report.currencyTotals as c (c.currency)}
				<div class="min-w-[200px] flex-1 rounded-control border border-hairline bg-[#fdf7f5] p-4">
					<div class="font-mono text-[11px] tracking-[1px] text-ink-300">{c.label}</div>
					<div class="mt-1 font-mono text-[26px] font-semibold tracking-[-1px] tnum">
						{formatMoney(c.total, c.currency)}
					</div>
					<div class="mt-0.5 text-[12.5px] text-ink-500">{c.deals} won deals</div>
				</div>
			{/each}
		</div>
	</div>
</div>
