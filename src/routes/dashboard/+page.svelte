<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { RangeBucketControl, type RangeBucket } from '$lib/components/ui/range-bucket-control';
	import { SearchInput } from '$lib/components/ui/search-input';
	import { Button } from '$lib/components/ui/button';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import DashboardCardGridSkeleton from '$lib/components/shared/skeletons/DashboardCardGridSkeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(pageState.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '' || v === false || v === 0) {
				params.delete(k);
			} else {
				params.set(k, String(v));
			}
		}
		return goto(`?${params}`, { keepFocus: true });
	}

	// Search debounce is owned by SearchInput (canonical 300ms) — page only navigates.
	function onSearch(value: string) {
		navigate({ q: value || undefined, page: undefined });
	}

	// Fixed stage order for the per-AE distribution mini-breakdown.
	const STAGE_ORDER: { key: string; label: string }[] = [
		{ key: 'new', label: 'New' },
		{ key: 'contacted', label: 'Contacted' },
		{ key: 'replied', label: 'Replied' },
		{ key: 'in_discussion', label: 'In discussion' },
		{ key: 'won', label: 'Won' },
		{ key: 'live', label: 'Live' },
		{ key: 'lost', label: 'Lost' }
	];

	function changeRange(bucket: RangeBucket) {
		navigate({ range: bucket, page: undefined });
	}
</script>

<svelte:head>
	<title>Dashboard · Veent CRM</title>
</svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="Team dashboard" subtitle="Per-AE performance across the selected range.">
		{#snippet actions()}
			<SearchInput
				value={data.filters.search ?? ''}
				oninput={onSearch}
				placeholder="Search AE…"
				ariaLabel="Search AEs by name"
				class="h-8 w-44"
			/>
			<RangeBucketControl value={data.range} onchange={changeRange} />
		{/snippet}
	</PageHeader>

	{#await data.dashboard}
		<DashboardCardGridSkeleton />
	{:then result}
		{@const rows = result.rows}
		{@const total = result.total}
		{@const pageSize = data.pagination.pageSize}
		{@const pg = data.pagination.page}
		{@const totalPages = Math.max(1, Math.ceil(total / pageSize))}
		{#if rows.length === 0}
			<p class="text-[13px] text-ink-500">No active AEs to show.</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each rows as ae (ae.id)}
					<a
						href={`/leads?segment=all&owner=${ae.id}&weeksAhead=all${data.rangeStartParam ? `&createdFrom=${data.rangeStartParam}` : ''}`}
						class="focus-ring block rounded-[10px] border border-hairline bg-panel p-4 transition-colors hover:bg-panel-sunken"
					>
						<div class="mb-2 flex items-baseline justify-between gap-2">
							<span class="truncate text-[14px] font-semibold">{ae.name}</span>
							<span class="font-mono text-[11px] text-ink-400">{ae.leadsOwned} leads</span>
						</div>

						<dl class="grid grid-cols-3 gap-2 text-center">
							<div>
								<dt class="font-mono text-[9.5px] uppercase tracking-[1px] text-ink-400">
									Won (all)
								</dt>
								<dd class="text-[15px] font-bold">{ae.wonAllTime}</dd>
							</div>
							<div>
								<dt class="font-mono text-[9.5px] uppercase tracking-[1px] text-ink-400">
									Won (range)
								</dt>
								<dd class="text-[15px] font-bold">{ae.wonInRange}</dd>
							</div>
							<div>
								<dt class="font-mono text-[9.5px] uppercase tracking-[1px] text-ink-400">
									Adherence
								</dt>
								<dd class="text-[15px] font-bold">{ae.adherencePct}%</dd>
							</div>
						</dl>

						<div class="mt-3 border-t border-hairline pt-2">
							<div class="mb-1 flex items-center justify-between">
								<span class="font-mono text-[9.5px] uppercase tracking-[1px] text-ink-400">
									Added (range)
								</span>
								<span class="font-mono text-[11px] font-semibold">{ae.leadsAddedInRange}</span>
							</div>
							<ul class="flex flex-wrap gap-1.5">
								{#each STAGE_ORDER as s (s.key)}
									{#if ae.stageDistribution[s.key]}
										<li
											class="rounded-[5px] border border-hairline bg-panel-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-500"
										>
											{s.label}: {ae.stageDistribution[s.key]}
										</li>
									{/if}
								{/each}
							</ul>
						</div>
					</a>
				{/each}
			</div>

			<!-- pagination -->
			{#if totalPages > 1}
				<div class="mt-5 flex items-center justify-end gap-2 text-[13px] text-ink-300">
					<Button
						variant="outline"
						size="sm"
						disabled={pg <= 1}
						onclick={() => navigate({ page: pg - 1 })}>← Prev</Button
					>
					<span class="font-mono">Page {pg} of {totalPages}</span>
					<Button
						variant="outline"
						size="sm"
						disabled={pg >= totalPages}
						onclick={() => navigate({ page: pg + 1 })}>Next →</Button
					>
				</div>
			{/if}
		{/if}
	{:catch}
		<p class="text-[13px] text-destructive">Could not load dashboard data.</p>
	{/await}
</div>
