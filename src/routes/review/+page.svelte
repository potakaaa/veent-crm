<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';

	let { data } = $props();
	const leads = $derived(data.leads);
</script>

<svelte:head><title>Review queue · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="Review queue" subtitle="{leads.length} leads need attention" />

	{#if leads.length === 0}
		<EmptyState title="All clear" hint="No leads flagged for review." tone="success" />
	{:else}
		<div class="overflow-hidden rounded-control border border-hairline bg-panel">
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
						<th class="px-4 py-2.5"></th>
					</tr>
				</thead>
				<tbody>
					{#each leads as lead (lead.id)}
						<tr class="border-b border-hairline last:border-0 hover:bg-panel-sunken">
							<td class="px-4 py-2.5 font-medium">{lead.name}</td>
							<td class="px-4 py-2.5 text-ink-600">{lead.category}</td>
							<td class="px-4 py-2.5 text-ink-600">{lead.platform ?? '—'}</td>
							<td class="px-4 py-2.5"><StageChip stage={lead.stage} /></td>
							<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">{lead.source}</td>
							<td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">
								{new Date(lead.createdAt).toLocaleDateString()}
							</td>
							<td class="px-4 py-2.5 text-right">
								<form method="POST" action="?/resolve">
									<input type="hidden" name="leadId" value={lead.id} />
									<button
										class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh"
									>
										Resolve
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
