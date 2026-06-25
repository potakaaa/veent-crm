<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Up for grabs · Veent CRM</title></svelte:head>

<StubNote>Self-claim / bulk-claim (race-safe) + manager bulk-assign + source filter go here.</StubNote>

<h1 class="mb-1 text-2xl font-semibold">Up for grabs</h1>
<p class="mb-4 text-gray-600">Unassigned leads ({data.leads.length}) — claim transfers ownership + edit rights.</p>

<div class="space-y-2">
	{#each data.leads as lead}
		<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
			<input type="checkbox" disabled />
			<a href={`/leads/${lead.id}`} class="font-medium text-blue-600 hover:underline">{lead.name}</a>
			<span class="text-xs text-gray-500">{lead.category} · {lead.platform}</span>
			<span class="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{lead.source}</span>
			<button type="button" class="ml-auto rounded border border-gray-300 px-3 py-1 text-sm" disabled>
				Claim
			</button>
		</div>
	{/each}
</div>
