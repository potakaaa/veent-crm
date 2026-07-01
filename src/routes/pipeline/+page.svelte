<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import SortToggle from '$lib/components/SortToggle.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Pipeline · Veent CRM</title></svelte:head>

<StubNote>Drag-to-move + quick-assign owner + Won prompt (org name + deal value) go here.</StubNote>

<div class="mb-4 flex items-center gap-3">
	<h1 class="text-2xl font-semibold">Pipeline</h1>
	<div class="ml-auto"><SortToggle sort={data.sort} /></div>
</div>

<div class="flex gap-4 overflow-x-auto pb-4">
	{#each data.columns as col}
		<div class="w-64 shrink-0 rounded-lg bg-gray-100 p-3">
			<div class="mb-2 flex items-center justify-between text-sm font-medium">
				<span class="capitalize">{col.stage.replace('_', ' ')}</span>
				<span class="rounded-full bg-white px-2 text-xs text-gray-500">{col.leads.length}</span>
			</div>
			<div class="space-y-2">
				{#each col.leads as lead}
					<a href={`/leads/${lead.id}`} class="block rounded border border-gray-200 bg-white p-2 text-sm hover:border-gray-400">
						<div class="flex items-center gap-2">
							<span class="font-medium">{lead.name}</span>
							<span class="ml-auto"><AppealScoreBadge score={lead.appealScore} /></span>
						</div>
						<div class="text-xs text-gray-500">{lead.ownerName ?? 'Unassigned'}</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}
</div>
