<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Review queue · Veent CRM</title></svelte:head>

<StubNote>Clean up <code>needs_review</code> leads (fix category/name, then clear the flag).</StubNote>

<h1 class="mb-1 text-2xl font-semibold">Review queue</h1>
<p class="mb-4 text-gray-600">{data.leads.length} lead(s) flagged for review.</p>

<div class="space-y-2">
	{#each data.leads as lead}
		<div class="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
			<a href={`/leads/${lead.id}`} class="font-medium text-blue-600 hover:underline">{lead.name}</a>
			<span class="text-xs text-gray-500">{lead.category} · {lead.source}</span>
			<button type="button" class="ml-auto rounded border border-gray-300 bg-white px-3 py-1 text-sm" disabled>
				Resolve
			</button>
		</div>
	{:else}
		<p class="text-sm text-gray-500">Nothing to review.</p>
	{/each}
</div>
