<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Today · Veent CRM</title></svelte:head>

<StubNote />

<h1 class="mb-1 text-2xl font-semibold">Today</h1>
<p class="mb-6 text-gray-600">
	The daily loop home — due/overdue follow-ups (Asia/Manila), quick log-touch, and search.
</p>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	{#each data.tiles as tile}
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="text-sm text-gray-500">{tile.label}</div>
			<div class="mt-1 text-3xl font-semibold">{tile.value}</div>
		</div>
	{/each}
</div>

<section class="mt-8">
	<h2 class="mb-3 text-lg font-medium">Due &amp; overdue follow-ups</h2>
	<div class="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
		No reminders wired yet — see <code>/reminders</code> and <code>/api/reminders/due</code>.
	</div>
</section>
