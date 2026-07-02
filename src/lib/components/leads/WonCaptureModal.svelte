<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { CURRENCIES } from '$lib/zod/schemas';
	import type { Currency, MoveStagePayload } from '$lib/types';

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
		onconfirm: (payload: MoveStagePayload) => void;
		saving?: boolean;
	} = $props();

	let signedOrg = $state('');
	let dealValue = $state('');
	let currency = $state<string>('PHP');
	const manilaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
	let signedDate = $state(manilaDate());

	$effect(() => {
		if (open) {
			signedOrg = leadName;
			dealValue = '';
			currency = 'PHP';
			signedDate = manilaDate();
		}
	});

	function confirm() {
		const normalized = dealValue.replace(/[^0-9.]/g, '');
		const parsedDealValue = normalized === '' ? undefined : Number(normalized);
		if (parsedDealValue !== undefined && !Number.isFinite(parsedDealValue)) return;

		onconfirm({
			wonOrgName: signedOrg.trim() || undefined,
			dealValueCents: parsedDealValue !== undefined ? Math.round(parsedDealValue * 100) : undefined,
			currency: currency as Currency,
			signedAt: signedDate
		});
	}
</script>

<Modal {open} {onclose} tone="success" title="Mark won — capture the deal" subtitle={leadName}>
	<div class="mb-3.5 grid gap-1.5">
		<Label for="won-org">Signed organization name <span class="text-red-500">*</span></Label>
		<Input
			id="won-org"
			bind:value={signedOrg}
			placeholder="e.g. Christian Concerts Productions Inc."
			class="font-mono"
		/>
	</div>
	<div class="mb-3.5 flex gap-3">
		<div class="grid flex-1 gap-1.5">
			<Label for="won-value"
				>Deal value <span class="font-normal text-ink-400">(optional)</span></Label
			>
			<Input id="won-value" bind:value={dealValue} placeholder="85,000" class="font-mono" />
		</div>
		<div class="grid w-[120px] gap-1.5">
			<Label for="won-cur">Currency</Label>
			<Select type="single" bind:value={currency}>
				<SelectTrigger id="won-cur" class="w-full font-mono">{currency}</SelectTrigger>
				<SelectContent>
					{#each CURRENCIES as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
				</SelectContent>
			</Select>
		</div>
	</div>
	<div class="grid gap-1.5">
		<Label for="won-date"
			>Signed date <span class="font-normal text-ink-400">(optional)</span></Label
		>
		<Input id="won-date" type="date" bind:value={signedDate} class="font-mono" />
	</div>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button
			variant="success"
			class="flex-[2]"
			onclick={confirm}
			loading={saving}
			loadingText="Saving…"
			disabled={saving || !signedOrg.trim()}>Mark won</Button
		>
	{/snippet}
</Modal>
