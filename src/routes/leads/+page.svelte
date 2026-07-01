<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import SortToggle from '$lib/components/SortToggle.svelte';

	let { data } = $props();

	const stageClass: Record<string, string> = {
		new: 'bg-gray-100 text-gray-700',
		contacted: 'bg-blue-100 text-blue-700',
		replied: 'bg-violet-100 text-violet-700',
		in_discussion: 'bg-amber-100 text-amber-800',
		won: 'bg-green-100 text-green-700',
		lost: 'bg-red-100 text-red-700'
	};
</script>

<svelte:head><title>Leads · Veent CRM</title></svelte:head>

<StubNote>SVAR DataGrid + pg_trgm fuzzy dedup search go here.</StubNote>

<div class="mb-4 flex items-center gap-3">
	<h1 class="text-2xl font-semibold">Leads</h1>
	<div class="ml-auto flex items-center gap-3">
		<SortToggle sort={data.sort} />
		<a href="/leads/new" class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">+ Add lead</a>
	</div>
</div>

<form class="mb-4" method="get">
	<input
		name="q"
		value={data.q}
		placeholder="Search page / handle (advisory dedup warns if already contacted)…"
		class="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
	/>
</form>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
	<table class="w-full text-sm">
		<thead class="bg-gray-50 text-left text-gray-500">
			<tr>
				<th class="px-3 py-2 font-medium">Page / organizer</th>
				<th class="px-3 py-2 font-medium">Category</th>
				<th class="px-3 py-2 font-medium">Platform</th>
				<th class="px-3 py-2 font-medium">Stage</th>
				<th class="px-3 py-2 font-medium">Appeal</th>
				<th class="px-3 py-2 font-medium">Owner</th>
				<th class="px-3 py-2 font-medium">Last activity</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-100">
			{#each data.leads as lead}
				<tr class="hover:bg-gray-50">
					<td class="px-3 py-2">
						<a href={`/leads/${lead.id}`} class="font-medium text-blue-600 hover:underline">
							{lead.name}
						</a>
						{#if lead.needsReview}
							<span class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">review</span>
						{/if}
					</td>
					<td class="px-3 py-2 text-gray-600">{lead.category}</td>
					<td class="px-3 py-2 text-gray-600">{lead.platform}</td>
					<td class="px-3 py-2">
						<span class="rounded px-2 py-0.5 text-xs {stageClass[lead.stage]}">{lead.stage}</span>
					</td>
					<td class="px-3 py-2"><AppealScoreBadge score={lead.appealScore} /></td>
					<td class="px-3 py-2 text-gray-600">{lead.ownerName ?? '—'}</td>
					<td class="px-3 py-2 text-gray-500">
						{lead.lastActivityAt ? lead.lastActivityAt.slice(0, 10) : '—'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
