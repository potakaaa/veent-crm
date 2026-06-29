<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.lead.name} · Veent CRM</title></svelte:head>

<StubNote
	>Event fields + SVAR activity timeline + add-touch composer + Won/Lost actions go here.</StubNote
>

<a href="/leads" class="text-sm text-blue-600 hover:underline">← Leads</a>

<div class="mt-2 mb-6 flex items-center gap-3">
	<h1 class="text-2xl font-semibold">{data.lead.name}</h1>
	<span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{data.lead.stage}</span>
</div>

<div class="grid gap-6 lg:grid-cols-3">
	<dl class="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm lg:col-span-1">
		<div class="flex justify-between">
			<dt class="text-gray-500">Category</dt>
			<dd>{data.lead.category}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500">Platform</dt>
			<dd>{data.lead.platform}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500">Location</dt>
			<dd>{data.lead.location || '—'}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500">Owner</dt>
			<dd>{data.lead.ownerName ?? 'Unassigned'}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500">Source</dt>
			<dd>{data.lead.source}</dd>
		</div>
	</dl>

	<div class="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
		<h2 class="mb-3 text-lg font-medium">Activity timeline</h2>
		{#if data.activities.length === 0}
			<p class="text-sm text-gray-500">No touches logged.</p>
		{:else}
			<ol class="space-y-3">
				{#each data.activities as a}
					<li class="border-l-2 border-gray-200 pl-3 text-sm">
						<div class="font-medium">{a.channel} · {a.outcome}</div>
						<div class="text-gray-500">{a.repName ?? '—'} · {a.occurredAt.slice(0, 10)}</div>
						<div class="text-gray-700">{a.notes}</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>
