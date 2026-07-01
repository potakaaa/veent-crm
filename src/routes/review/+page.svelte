<script lang="ts">
	import { goto, afterNavigate, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { makeSortTable } from '$lib/utils/tableSort';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import DiscardIssueModal from '$lib/components/leads/DiscardIssueModal.svelte';
	import LeadEditModal from '$lib/components/leads/LeadEditModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import { sourceLabel } from '$lib/utils/sources';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	let shadowLeads = $derived(data.leads);
	let resolving = $state<Record<string, boolean>>({});
	let paging = $state(false);

	let discardTarget = $state<{ id: string; name: string } | null>(null);
	let discarding = $state<Record<string, boolean>>({});

	let editTarget = $state<Lead | null>(null);
	let editSaving = $state(false);

	async function saveEdit(leadData: Record<string, unknown>) {
		if (!editTarget || editSaving) return;
		editSaving = true;
		try {
			const res = await fetch(`/api/leads/${editTarget.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(leadData)
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Could not save: ${msg}`);
				return; // keep modal open
			}
			editTarget = null;
			await invalidateAll();
			toasts.success('Lead updated');
		} catch {
			toasts.push('Could not save — please try again');
		} finally {
			editSaving = false;
		}
	}

	async function saveAndResolve(leadData: Record<string, unknown>) {
		if (!editTarget || editSaving) return;
		editSaving = true;
		const leadId = editTarget.id;
		let failedLead: (typeof shadowLeads)[number] | undefined;
		try {
			// Save edits first; keep modal open on failure.
			const patchRes = await fetch(`/api/leads/${leadId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(leadData)
			});
			if (!patchRes.ok) {
				const msg = await patchRes.text().catch(() => 'Server error');
				toasts.push(`Could not save: ${msg}`);
				return;
			}
			// Optimistically remove from list and call the resolve action.
			editTarget = null;
			failedLead = shadowLeads.find((l) => l.id === leadId);
			shadowLeads = removeFromList(shadowLeads, leadId);
			resolving = { ...resolving, [leadId]: true };
			const formData = new FormData();
			formData.set('leadId', leadId);
			formData.set('page', String(data.pagination.page));
			const resolveRes = await fetch('?/resolve', { method: 'POST', body: formData });
			if (resolveRes.ok) {
				await invalidateAll();
				toasts.success('Lead updated and resolved');
			} else {
				const lead = failedLead;
				if (lead && !shadowLeads.some((l) => l.id === lead.id)) {
					shadowLeads = [...shadowLeads, lead];
				}
				toasts.push('Saved but could not resolve — please try again');
			}
		} catch {
			const lead = failedLead;
			if (lead && !shadowLeads.some((l) => l.id === lead.id)) {
				shadowLeads = [...shadowLeads, lead];
			}
			toasts.push('Could not complete — please try again');
		} finally {
			editSaving = false;
			resolving = { ...resolving, [leadId]: false };
		}
	}

	const navLoading = $derived(paging || navigating.to?.url.pathname === '/review');

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

	const table = $derived(
		makeSortTable({
			data: shadowLeads,
			columns: [
				{ id: 'name', header: 'Name' },
				{ id: 'category', header: 'Category' },
				{ id: 'platform', header: 'Platform' },
				{ id: 'stage', header: 'Stage' },
				{ id: 'source', header: 'Source' },
				{ id: 'event', header: 'Event' },
				{ id: 'createdAt', header: 'Added' },
				{ id: '_actions', header: '', enableSorting: false }
			],
			sort: data.sort ?? '',
			dir: data.dir,
			onToggle(id, desc) {
				navigate({ sort: id, dir: desc ? 'desc' : 'asc', page: undefined });
			}
		})
	);

	async function confirmDiscard() {
		const target = discardTarget;
		if (!target) return;
		if (discarding[target.id]) return;

		discarding = { ...discarding, [target.id]: true };
		const failedLead = shadowLeads.find((l) => l.id === target.id);
		shadowLeads = removeFromList(shadowLeads, target.id);

		try {
			const res = await fetch(`/api/leads/${target.id}/discard`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			discardTarget = null;
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

	{#if !navLoading && shadowLeads.length === 0}
		<EmptyState title="All clear" hint="No leads flagged for review." tone="success" />
	{:else}
		<div class="overflow-x-auto rounded-control border border-hairline bg-panel">
			<table class="w-full text-[13px]">
				<thead>
					{#each table.getHeaderGroups() as headerGroup}
						<tr
							class="border-b border-hairline font-mono text-[10px] uppercase tracking-wider text-ink-300"
						>
							{#each headerGroup.headers as header}
								{#if header.id === '_actions'}
									<th class="px-4 py-2.5 text-left" scope="col"
										><span class="sr-only">Actions</span></th
									>
								{:else if header.column.getCanSort()}
									<th
										class="px-4 py-2.5 text-left"
										aria-sort={header.column.getIsSorted() === 'asc'
											? 'ascending'
											: header.column.getIsSorted() === 'desc'
												? 'descending'
												: 'none'}
									>
										<button
											onclick={header.column.getToggleSortingHandler()}
											class={header.column.getIsSorted()
												? 'cursor-pointer font-semibold text-ink-600 underline underline-offset-2'
												: 'cursor-pointer text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2'}
										>
											{header.column.columnDef.header}{header.column.getIsSorted() === 'asc'
												? ' ↑'
												: header.column.getIsSorted() === 'desc'
													? ' ↓'
													: ''}
										</button>
									</th>
								{:else}
									<th class="px-4 py-2.5 text-left">{header.column.columnDef.header}</th>
								{/if}
							{/each}
						</tr>
					{/each}
				</thead>
				<tbody>
					{#if navLoading}
						{#each Array(6) as _, i (i)}
							<tr class="border-b border-hairline last:border-0">
								{#each Array(8) as _, c (c)}
									<td class="px-4 py-3"><Skeleton class="h-3.5 w-full" /></td>
								{/each}
							</tr>
						{/each}
					{:else}
						{#each table.getRowModel().rows as row (row.original.id)}
							{@const lead = row.original}
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
									{#if lead.eventDate}
										<span title={lead.eventName ?? undefined}>{lead.eventDate}</span>
									{:else}
										—
									{/if}
								</td>
								<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">
									{new Date(lead.createdAt).toISOString().split('T')[0]}
								</td>
								<td class="px-4 py-2.5 text-right">
									<div class="flex items-center justify-end gap-2">
										<button
											disabled={resolving[lead.id] || discarding[lead.id] || editSaving}
											onclick={() => (editTarget = lead)}
											class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh disabled:opacity-50"
											aria-label="Resolve {lead.name}"
										>
											{resolving[lead.id] ? 'Resolving…' : 'Resolve'}
										</button>
										<button
											disabled={resolving[lead.id] || discarding[lead.id] || editSaving}
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
					{/if}
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

{#if editTarget}
	<LeadEditModal
		open={true}
		lead={editTarget}
		saving={editSaving}
		onclose={() => (editTarget = null)}
		onsave={saveEdit}
		onresolve={saveAndResolve}
	/>
{/if}
