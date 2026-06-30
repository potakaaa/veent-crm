<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { TableSkeleton } from '$lib/components/shared/skeletons';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';

	let { data } = $props();

	// E1: writable $derived auto-resyncs to server truth after invalidateAll().
	let shadowLeads = $derived(data.leads);

	// Per-lead resolve pending state (also the duplicate-submit guard).
	let resolving = $state<Record<string, boolean>>({});

	const navLoading = $derived(navigating.to?.url.pathname === '/review');

	function sortHref(col: string) {
		const nextDir = data.sort === col && data.dir === 'asc' ? 'desc' : 'asc';
		return `?sort=${col}&dir=${nextDir}`;
	}
	function sortCls(col: string) {
		return data.sort === col
			? 'text-ink-600 font-semibold underline underline-offset-2'
			: 'text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2 cursor-pointer';
	}
	function sortInd(col: string) {
		return data.sort === col ? (data.dir === 'asc' ? ' ↑' : ' ↓') : '';
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
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('name')} class={sortCls('name')}>Name{sortInd('name')}</a></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('category')} class={sortCls('category')}
								>Category{sortInd('category')}</a
							></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('platform')} class={sortCls('platform')}
								>Platform{sortInd('platform')}</a
							></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('stage')} class={sortCls('stage')}>Stage{sortInd('stage')}</a></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('source')} class={sortCls('source')}>Source{sortInd('source')}</a
							></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('event')} class={sortCls('event')}>Event{sortInd('event')}</a></th
						>
						<th class="px-4 py-2.5 text-left"
							><a href={sortHref('createdAt')} class={sortCls('createdAt')}
								>Added{sortInd('createdAt')}</a
							></th
						>
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
				</tbody>
			</table>
		</div>
	{/if}
</div>
