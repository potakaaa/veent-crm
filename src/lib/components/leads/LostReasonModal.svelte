<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { LOST_REASONS } from '$lib/zod/schemas';
	import type { LostReason } from '$lib/types';

	let {
		open,
		leadName,
		onclose,
		onconfirm
	}: {
		open: boolean;
		leadName: string;
		onclose: () => void;
		onconfirm: (reason: LostReason, note?: string) => void;
	} = $props();

	const REASON_LABEL: Record<LostReason, string> = {
		no_response: 'No response',
		rejected: 'Rejected',
		not_a_fit: 'Not a fit'
	};

	let reason = $state<LostReason | ''>('');
	let note = $state('');

	$effect(() => {
		if (open) {
			reason = '';
			note = '';
		}
	});
</script>

<Modal
	{open}
	{onclose}
	title="Mark lost — pick a reason"
	subtitle={`${leadName} · Lost leads stay searchable; we never auto-mark cold leads lost.`}
>
	<div class="mb-2 text-[11.5px] text-ink-300">Reason (required)</div>
	<div class="flex flex-col gap-2">
		{#each LOST_REASONS as r}
			<Button
				variant={reason === r ? 'secondary' : 'outline'}
				class="h-10 justify-start {reason === r
					? 'border-primary bg-[rgba(192,54,44,0.06)] text-ink'
					: ''}"
				onclick={() => (reason = r)}
			>
				{REASON_LABEL[r]}
			</Button>
		{/each}
	</div>
	<div class="mt-3 grid gap-1.5">
		<Label for="lost-note">Note (optional)</Label>
		<Textarea id="lost-note" bind:value={note} class="min-h-14" />
	</div>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose}>Cancel</Button>
		<Button
			variant="destructive"
			class="flex-[2]"
			disabled={!reason}
			onclick={() => reason && onconfirm(reason, note.trim() || undefined)}
		>
			Mark lost
		</Button>
	{/snippet}
</Modal>
