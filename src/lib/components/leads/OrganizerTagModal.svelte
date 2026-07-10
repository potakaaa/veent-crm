<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { OrganizerWithCount } from '$lib/server/db/organizers';

	let {
		open,
		organizers,
		currentOrganizerId = null,
		onclose,
		onconfirm
	}: {
		open: boolean;
		organizers: OrganizerWithCount[];
		currentOrganizerId?: string | null;
		onclose: () => void;
		onconfirm: (organizerId: string | null) => void;
	} = $props();

	let selected = $state('');

	$effect(() => {
		if (open) {
			selected = currentOrganizerId ?? '';
		}
	});
</script>

<Modal
	{open}
	{onclose}
	title="Tag organizer"
	subtitle="Link this lead to an existing organizer."
	width={420}
>
	<div class="max-h-[min(60vh,28rem)] overflow-y-auto pr-1">
		{#if organizers.length === 0}
			<div class="px-1 py-6 text-center text-[13px] text-ink-300">No organizers exist yet.</div>
		{:else}
			<div class="flex flex-col gap-1.5">
				{#if currentOrganizerId}
					<Button
						variant="outline"
						class="h-11 justify-start gap-2.5"
						onclick={() => onconfirm(null)}
					>
						<span class="text-[13px] font-semibold">Clear tag — no organizer</span>
					</Button>
				{/if}
				{#each organizers as org (org.id)}
					<Button
						variant="outline"
						class="h-11 justify-start gap-2.5 {selected === org.id
							? 'border-primary bg-[rgba(192,54,44,0.06)]'
							: ''}"
						onclick={() => (selected = org.id)}
					>
						<span class="text-[13px] font-semibold">{org.name}</span>
						{#if org.location}
							<span class="ml-auto font-mono text-[11px] text-ink-300">{org.location}</span>
						{/if}
					</Button>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose}>Cancel</Button>
		<Button class="flex-[2]" disabled={!selected} onclick={() => selected && onconfirm(selected)}>
			Tag
		</Button>
	{/snippet}
</Modal>
