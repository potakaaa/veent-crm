<script lang="ts">
	import { goto, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { Button } from '$lib/components/ui/button';
	import { sourceLabel } from '$lib/utils/sources';

	let { data } = $props();

	let paging = $state(false);
	afterNavigate(() => {
		paging = false;
	});

	function navigate(patch: Record<string, string | number | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) params.delete(k);
			else params.set(k, String(v));
		}
		goto(`?${params}`, { keepFocus: true });
	}

	const grid = 'grid grid-cols-[2fr_1.2fr_1fr_90px_90px_110px_88px] gap-3';
</script>

<svelte:head><title>Review queue · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Review queue"
		subtitle="{data.pagination.total} lead{data.pagination.total === 1
			? ''
			: 's'} flagged for attention"
	/>

	{#if data.pagination.total === 0}
		<EmptyState title="All clear" hint="No leads flagged for review." tone="success" />
	{:else}
		<div class="overflow-hidden rounded-control border border-hairline bg-panel">
			<div
				class="{grid} items-center border-b border-hairline bg-[#fdf7f5] px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
			>
				<span>Name</span>
				<span>Category</span>
				<span>Platform</span>
				<span>Stage</span>
				<span>Source</span>
				<span>Added</span>
				<span></span>
			</div>

			{#each data.leads as lead (lead.id)}
				<div
					class="{grid} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fdf7f5]"
				>
					<a href="/leads/{lead.id}" class="min-w-0">
						<div class="truncate text-[13px] font-semibold text-ink-900">{lead.name}</div>
						<div class="font-mono text-[11px] text-ink-400">{lead.handle}</div>
					</a>
					<div class="truncate text-[12.5px] text-ink-600">{lead.category}</div>
					<div class="truncate font-mono text-[12px] text-ink-500">{lead.platform ?? '—'}</div>
					<div><StageChip stage={lead.stage} /></div>
					<div>
						<span
							class="rounded-[5px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium {sourceLabel(
								lead.source
							).class}"
						>
							{sourceLabel(lead.source).label}
						</span>
					</div>
					<div class="font-mono text-[11px] text-ink-400">
						{new Date(lead.createdAt).toLocaleDateString('en-PH', {
							month: 'short',
							day: 'numeric',
							year: 'numeric'
						})}
					</div>
					<div>
						<form method="POST" action="?/resolve">
							<input type="hidden" name="leadId" value={lead.id} />
							<button
								class="h-[30px] w-full rounded-[7px] border border-hairline bg-panel px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh"
								aria-label="Resolve {lead.name}"
							>
								Resolve
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>

		{#if data.pagination.totalPages > 1}
			{@const { page: pg, pageSize, total, totalPages } = data.pagination}
			{@const start = (pg - 1) * pageSize + 1}
			{@const end = Math.min(pg * pageSize, total)}
			<div class="mt-5 flex items-center justify-between text-[13px] text-ink-300">
				<span class="font-mono">{start}–{end} of {total}</span>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={pg <= 1 || paging}
						onclick={() => {
							paging = true;
							navigate({ page: pg - 1 });
						}}>← Prev</Button
					>
					<span class="font-mono">Page {pg} of {totalPages}</span>
					<Button
						variant="outline"
						size="sm"
						disabled={pg >= totalPages || paging}
						onclick={() => {
							paging = true;
							navigate({ page: pg + 1 });
						}}>Next →</Button
					>
				</div>
			</div>
		{/if}
	{/if}
</div>
