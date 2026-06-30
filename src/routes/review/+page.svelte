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

	// E3: this page previously used a plain native form with no use:enhance and no
	// client-side pending state. We now add use:enhance + a writable `$derived` shadow so
	// the resolve action removes the row optimistically and rolls back on failure.
	// E1: a writable `$derived` auto-resyncs to server truth after invalidateAll().
	let shadowLeads = $derived(data.leads);

	// Per-lead resolve pending state (also the duplicate-submit guard).
	let resolving = $state<Record<string, boolean>>({});

	const navLoading = $derived(navigating.to?.url.pathname === '/review');

	/**
	 * Build a use:enhance SubmitFunction for one review row.
	 * - submit phase: guard duplicates, optimistically remove the row, capture rollback point
	 * - result phase: success → invalidateAll() reconciles; failure/error → rollback + toast
	 */
	function resolveEnhance(leadId: string): SubmitFunction {
		return ({ cancel }) => {
			if (resolving[leadId]) return cancel(); // duplicate-submit guard
			resolving = { ...resolving, [leadId]: true };
			const snapshot = shadowLeads;
			shadowLeads = removeFromList(shadowLeads, leadId); // optimistic remove

			return async ({ result }) => {
				resolving = { ...resolving, [leadId]: false };
				if (result.type === 'success' || result.type === 'redirect') {
					await invalidateAll(); // reconcile shadow with server truth
				} else {
					shadowLeads = snapshot; // rollback on failure/error
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
							<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">{lead.source}</td>
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
