<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { User } from '$lib/types';

	let {
		open,
		users,
		currentOwnerId = null,
		onclose,
		onconfirm
	}: {
		open: boolean;
		users: User[];
		currentOwnerId?: string | null;
		onclose: () => void;
		onconfirm: (ownerId: string) => void;
	} = $props();

	// Seeded once from the prop; user clicks override it (no reactive mirror).
	let selected = $state(untrack(() => currentOwnerId ?? ''));

	const reps = $derived(users.filter((u) => u.active));
</script>

<Modal
	{open}
	{onclose}
	title="Reassign owner"
	subtitle="Hand this lead to another rep."
	width={420}
>
	<div class="flex flex-col gap-1.5">
		{#each reps as u (u.id)}
			<Button
				variant="outline"
				class="h-11 justify-start gap-2.5 {selected === u.id
					? 'border-primary bg-[rgba(192,54,44,0.06)]'
					: ''}"
				onclick={() => (selected = u.id)}
			>
				<Avatar name={u.name} size="md" />
				<span class="text-[13px] font-semibold">{u.name}</span>
				<span class="ml-auto font-mono text-[11px] text-ink-300">{u.role}</span>
			</Button>
		{/each}
	</div>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose}>Cancel</Button>
		<Button class="flex-[2]" disabled={!selected} onclick={() => selected && onconfirm(selected)}>
			Reassign
		</Button>
	{/snippet}
</Modal>
