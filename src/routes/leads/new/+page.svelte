<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';
	import { LEAD_CATEGORIES, LEAD_PLATFORMS } from '$lib/zod/schemas';
</script>

<svelte:head><title>Add lead · Veent CRM</title></svelte:head>

<StubNote>Superforms + Zod (<code>leadFormSchema</code>) + advisory dedup-warn-on-add go here.</StubNote>

<h1 class="mb-4 text-2xl font-semibold">Add lead</h1>

<form class="max-w-lg space-y-4" method="post">
	<div>
		<label class="mb-1 block text-sm font-medium" for="name">Page / organizer name</label>
		<input id="name" name="name" class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
	</div>
	<div class="grid grid-cols-2 gap-4">
		<div>
			<label class="mb-1 block text-sm font-medium" for="category">Category</label>
			<select id="category" name="category" class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
				{#each LEAD_CATEGORIES as c}<option>{c}</option>{/each}
			</select>
		</div>
		<div>
			<label class="mb-1 block text-sm font-medium" for="platform">Platform</label>
			<select id="platform" name="platform" class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
				{#each LEAD_PLATFORMS as p}<option>{p}</option>{/each}
			</select>
		</div>
	</div>
	<div>
		<label class="mb-1 block text-sm font-medium" for="pageUrl">Page URL</label>
		<input id="pageUrl" name="pageUrl" class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
	</div>
	<button type="button" class="rounded bg-gray-900 px-4 py-2 text-sm text-white" disabled>
		Save (stub — not wired)
	</button>
</form>
