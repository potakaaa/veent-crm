<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { makeSortTable } from '$lib/utils/tableSort';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';

	let { data } = $props();

	// E1: writable $derived auto-resyncs to server truth after invalidateAll().
	let shadowLeads = $derived(data.leads);

	// Per-lead resolve pending state (also the duplicate-submit guard).
	let resolving = $state<Record<string, boolean>>({});

	const navLoading = $derived(navigating.to?.url.pathname === '/review');

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
				goto(`?sort=${id}&dir=${desc ? 'desc' : 'asc'}`, { keepFocus: true });
			}
		})
	);

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
								<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">{lead.source}</td>
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
									<form method="POST" action="?/resolve" use:enhance={resolveEnhance(lead.id)}>
										<input type="hidden" name="leadId" value={lead.id} />
										<button
											disabled={resolving[lead.id]}
											class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh disabled:opacity-50"
											aria-label="Resolve {lead.name}"
										>
											{resolving[lead.id] ? 'Saving…' : 'Resolve'}
										</button>
									</form>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>
