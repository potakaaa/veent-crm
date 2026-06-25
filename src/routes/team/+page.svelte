<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Team · Veent CRM</title></svelte:head>

<StubNote>Manager-only. This roster is the magic-link allowlist (active + email).</StubNote>

<h1 class="mb-4 text-2xl font-semibold">Team management</h1>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
	<table class="w-full text-sm">
		<thead class="bg-gray-50 text-left text-gray-500">
			<tr><th class="px-3 py-2 font-medium">Name</th><th class="px-3 py-2 font-medium">Email</th><th class="px-3 py-2 font-medium">Role</th><th class="px-3 py-2 font-medium">Status</th></tr>
		</thead>
		<tbody class="divide-y divide-gray-100">
			{#each data.reps as r}
				<tr class="hover:bg-gray-50">
					<td class="px-3 py-2 font-medium">{r.name}</td>
					<td class="px-3 py-2 text-gray-600">{r.email ?? '— (record-only)'}</td>
					<td class="px-3 py-2 text-gray-600">{r.role}</td>
					<td class="px-3 py-2">
						<span class="rounded px-2 py-0.5 text-xs {r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
							{r.active ? 'active' : 'former'}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
