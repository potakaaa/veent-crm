<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props();
</script>

<svelte:head><title>Team · Veent CRM</title></svelte:head>

<StubNote>Manager-only. This roster is the magic-link allowlist (active + email).</StubNote>

<h1 class="mb-4 text-2xl font-semibold">Team management</h1>

<div class="rounded-lg border border-gray-200 bg-white">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Name</Table.Head>
				<Table.Head>Email</Table.Head>
				<Table.Head>Role</Table.Head>
				<Table.Head>Status</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.users as u}
				<Table.Row>
					<Table.Cell class="font-medium">{u.name}</Table.Cell>
					<Table.Cell class="text-muted-foreground">{u.email ?? '— record only'}</Table.Cell>
					<Table.Cell>{u.role}</Table.Cell>
					<Table.Cell>
						<span class="rounded px-2 py-0.5 text-xs {u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
							{u.active ? 'active' : 'former'}
						</span>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
