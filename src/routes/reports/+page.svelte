<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();

	const maxFunnel = $derived(Math.max(...data.funnel.map((f) => f.count), 1));
</script>

<svelte:head><title>Reports · Veent CRM</title></svelte:head>

<StubNote>Apache ECharts funnel + leaderboard + CSV export go here (bars below are placeholders).</StubNote>

<h1 class="mb-4 text-2xl font-semibold">Reports</h1>

<div class="grid gap-6 lg:grid-cols-2">
	<section class="rounded-lg border border-gray-200 bg-white p-4">
		<h2 class="mb-3 text-lg font-medium">Funnel by stage</h2>
		<div class="space-y-2">
			{#each data.funnel as f}
				<div class="flex items-center gap-2 text-sm">
					<span class="w-28 shrink-0 capitalize text-gray-600">{f.stage.replace('_', ' ')}</span>
					<div class="h-5 rounded bg-blue-500" style={`width:${(f.count / maxFunnel) * 100}%`}></div>
					<span class="text-gray-500">{f.count}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-4">
		<h2 class="mb-3 text-lg font-medium">Per-rep leaderboard</h2>
		<table class="w-full text-sm">
			<thead class="text-left text-gray-500">
				<tr><th class="py-1 font-medium">Rep</th><th class="py-1 font-medium">Wins</th><th class="py-1 font-medium">Touches</th><th class="py-1 font-medium">Replies</th></tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each data.leaderboard as r}
					<tr><td class="py-1.5 font-medium">{r.rep}</td><td>{r.wins}</td><td>{r.touches}</td><td>{r.replies}</td></tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-3 text-xs text-gray-400">Wins + activity shown side-by-side so cherry-picking is visible.</p>
	</section>
</div>
