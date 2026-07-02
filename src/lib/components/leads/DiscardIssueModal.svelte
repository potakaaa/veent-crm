<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		open,
		leadName,
		onclose,
		onconfirm,
		saving = false
	}: {
		open: boolean;
		leadName: string;
		onclose: () => void;
		onconfirm: () => void;
		saving?: boolean;
	} = $props();
</script>

<Modal {open} {onclose} title="Discard this lead?" width={420}>
	<p class="text-[13.5px] leading-relaxed text-ink-600">
		Are you sure you want to discard <strong class="text-ink">{leadName}</strong>? It will be
		removed from all active queues. This can be recovered by an admin.
	</p>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button
			variant="destructive"
			class="flex-[2]"
			disabled={saving}
			loading={saving}
			loadingText="Discarding…"
			onclick={onconfirm}
		>
			Yes, discard
		</Button>
	{/snippet}
</Modal>
