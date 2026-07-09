<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { CURRENCIES } from '$lib/zod/schemas';
	import type { MoveStagePayload, Currency } from '$lib/types';

	let {
		open,
		leadName,
		defaultCurrency = 'PHP',
		onclose,
		onconfirm,
		saving = false
	}: {
		open: boolean;
		leadName: string;
		defaultCurrency?: Currency;
		onclose: () => void;
		onconfirm: (payload: MoveStagePayload) => void;
		saving?: boolean;
	} = $props();

	let revenue = $state('');
	let currency = $state<Currency>('PHP');

	$effect(() => {
		if (open) {
			revenue = '';
			currency = defaultCurrency || 'PHP';
		}
	});

	const parsedRevenueCents = $derived.by(() => {
		const normalized = revenue.replace(/[^0-9.]/g, '');
		if (normalized === '') return undefined;
		const majorUnits = Number(normalized);
		if (!Number.isFinite(majorUnits) || majorUnits < 0) return undefined;
		return Math.round(majorUnits * 100);
	});

	const isValid = $derived(parsedRevenueCents !== undefined);

	function confirm() {
		if (parsedRevenueCents === undefined) return;
		onconfirm({
			revenueCents: parsedRevenueCents,
			currency
		});
	}
</script>

<Modal {open} {onclose} tone="success" title="Mark done — capture the revenue" subtitle={leadName}>
	<div class="mb-3.5 flex gap-3">
		<div class="grid flex-1 gap-1.5">
			<Label for="done-revenue">Revenue <span class="text-red-500">*</span></Label>
			<Input
				id="done-revenue"
				bind:value={revenue}
				placeholder="85,000"
				inputmode="decimal"
				class="font-mono"
			/>
		</div>
		<div class="grid w-[120px] gap-1.5">
			<Label for="done-cur">Currency</Label>
			<Select type="single" bind:value={currency}>
				<SelectTrigger id="done-cur" class="w-full font-mono">{currency}</SelectTrigger>
				<SelectContent>
					{#each CURRENCIES as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
				</SelectContent>
			</Select>
		</div>
	</div>

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button
			variant="success"
			class="flex-[2]"
			onclick={confirm}
			loading={saving}
			loadingText="Saving…"
			disabled={saving || !isValid}>Mark done</Button
		>
	{/snippet}
</Modal>
