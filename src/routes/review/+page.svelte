<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, afterNavigate, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { SubmitFunction } from '@sveltejs/kit';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { TableSkeleton } from '$lib/components/shared/skeletons';
	import { Button } from '$lib/components/ui/button';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import DiscardIssueModal from '$lib/components/leads/DiscardIssueModal.svelte';
	import { sourceLabel } from '$lib/utils/sources';

	let { data } = $props();

	let shadowLeads = $derived(data.leads);
	let resolving = $state<Record<string, boolean>>({});
	let paging = $state(false);

	// Discard modal state — null when closed, set to the target lead when open.
	let discardTarget = $state<{ id: string; name: string } | null>(null);
	let discarding = $state<Record<string, boolean>>({});

	const navLoading = $derived(navigating.to?.url.pathname === '/review');

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

	function resolveEnhance(leadId: string): SubmitFunction {
		return ({ cancel }) => {
			if (resolving[leadId]) return cancel();
			resolving = { ...resolving, [leadId]: true };
			const failedLead = shadowLeads.find((l) => l.id === leadId);
			shadowLeads = removeFromList(shadowLeads, leadId);

			return async ({ result }) => {
				resolving = { ...resolving, [leadId]: false };
				if (result.type === 'success' || result.type === 'redirect') {
					await invalidateAll();
				} else {
					if (failedLead && !shadowLeads.some((l) => l.id === failedLead.id)) {
						shadowLeads = [...shadowLeads, failedLead];
					}
					toasts.push('Could not resolve — please try again');
				}
			};
		};
	}

	async function confirmDiscard() {
		const target = discardTarget;
		if (!target) return;
		if (discarding[target.id]) return;

		discarding = { ...discarding, [target.id]: true };
		const failedLead = shadowLeads.find((l) => l.id === target.id);
		shadowLeads = removeFromList(shadowLeads, target.id); // optimistic remove

		try {
			const res = await fetch(`/api/leads/${target.id}/discard`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			discardTarget = null; // close modal only on success
			await invalidateAll();
		} catch {
			if (failedLead && !shadowLeads.some((l) => l.id === failedLead.id)) {
				shadowLeads = [...shadowLeads, failedLead];
			}
			toasts.push('Could not discard — please try again');
		} finally {
			discarding = { ...discarding, [target.id]: false };
		}
	}
</script>

<svelte:head><title>Review queue · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="Review queue" subtitle="{shadowLeads.length} leads need attention" />

	{#if navLoading}
		<TableSkeleton rows={6} cols={6} />
	{:else if shadowLeads.length === 0}
		<EmptyState title="All clear" hint="No leads flagged for review." tone="success" />
	{:else}
		<div class="overflow-x-auto rounded-control border border-hairline bg-panel">
			<table class="w-full text-[13px]">
				<thead>
					<tr
						class="border-b border-hairline font-mono text-[10px] uppercase tracking-wider text-ink-300"
					>
						<th class="px-4 py-2.5 text-left">Name</th>
						<th class="px-4 py-2.5 text-left">Category</th>
						<th class="px-4 py-2.5 text-left">Platform</th>
						<th class="px-4 py-2.5 text-left">Stage</th>
						<th class="px-4 py-2.5 text-left">Source</th>
						<th class="px-4 py-2.5 text-left">Added</th>
						<th class="px-4 py-2.5 text-left" scope="col"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each shadowLeads as lead (lead.id)}
						<tr class="border-b border-hairline last:border-0 hover:bg-panel-sunken">
							<td class="px-4 py-2.5 font-medium">{lead.name}</td>
							<td class="px-4 py-2.5 text-ink-600">{lead.category}</td>
							<td class="px-4 py-2.5 text-ink-600">{lead.platform ?? '—'}</td>
							<td class="px-4 py-2.5"><StageChip stage={lead.stage} /></td>
							<td class="px-4 py-2.5">
								<span
									class="rounded-[5px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium {sourceLabel(
										lead.source
									).class}">{sourceLabel(lead.source).label}</span
								>
							</td>
							<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">
								{new Date(lead.createdAt).toISOString().split('T')[0]}
							</td>
							<td class="px-4 py-2.5 text-right">
								<div class="flex items-center justify-end gap-2">
									<form method="POST" action="?/resolve" use:enhance={resolveEnhance(lead.id)}>
										<input type="hidden" name="leadId" value={lead.id} />
										<input type="hidden" name="page" value={data.pagination.page} />
										<button
											disabled={resolving[lead.id] || discarding[lead.id]}
											class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh disabled:opacity-50"
											aria-label="Resolve {lead.name}"
										>
											{resolving[lead.id] ? 'Saving…' : 'Resolve'}
										</button>
									</form>
									<button
										disabled={resolving[lead.id] || discarding[lead.id]}
										onclick={() => (discardTarget = { id: lead.id, name: lead.name })}
										class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-red-400 hover:text-red-500 disabled:opacity-50"
										aria-label="Discard {lead.name}"
									>
										{discarding[lead.id] ? 'Discarding…' : 'Discard'}
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
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

{#if discardTarget}
	<DiscardIssueModal
		open={true}
		leadName={discardTarget.name}
		saving={discarding[discardTarget.id] ?? false}
		onclose={() => (discardTarget = null)}
		onconfirm={confirmDiscard}
	/>
{/if}
