<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { setImportWizard } from './import-wizard-state.svelte';
	import type { ImportTarget, PreviewRow } from '$lib/utils/import-mapping';
	import SourceStep from './steps/SourceStep.svelte';
	import TargetStep from './steps/TargetStep.svelte';
	import MappingStep from './steps/MappingStep.svelte';
	import PreviewStep from './steps/PreviewStep.svelte';
	import ResultStep from './steps/ResultStep.svelte';

	let {
		open = false,
		onOpenChange,
		defaultTarget,
		locked = false
	}: {
		open?: boolean;
		onOpenChange: (open: boolean) => void;
		defaultTarget?: ImportTarget;
		locked?: boolean;
	} = $props();

	const wizard = setImportWizard({ defaultTarget, locked });

	let busy = $state(false);
	let wasOpen = $state(false);

	// Fresh state each time the modal opens (no stale rows from a prior import).
	$effect(() => {
		if (open && !wasOpen) wizard.reset();
		wasOpen = open;
	});

	const stepTitles: Record<string, string> = {
		source: 'Import — choose a source',
		target: 'Import — what to import',
		mapping: 'Import — map columns',
		preview: 'Import — preview',
		result: 'Import — done'
	};

	async function loadPreviewFlags() {
		busy = true;
		try {
			const res = await fetch('/api/import/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					target: wizard.target,
					rows: wizard.previewRows.map((r) => r.data)
				})
			});
			if (res.ok) {
				const body: { previews: Array<Omit<PreviewRow, 'normalizedHandle' | 'sourceRef'>> } =
					await res.json();
				const flagged: PreviewRow[] = wizard.previewRows.map((r, i) => ({
					...r,
					isDuplicate: body.previews[i]?.isDuplicate ?? false,
					duplicateReason: body.previews[i]?.duplicateReason
				}));
				wizard.applyDuplicateFlags(flagged);
			}
		} catch {
			// Non-fatal: preview still works without dedup flags.
		} finally {
			busy = false;
		}
	}

	async function onMappingNext() {
		if (!wizard.advance()) return; // builds preview rows, step → preview
		await loadPreviewFlags();
	}

	async function onCommit() {
		busy = true;
		try {
			const res = await fetch('/api/import/commit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ target: wizard.target, rows: wizard.commitRows() })
			});
			if (res.ok) {
				wizard.result = await res.json();
				wizard.advance(); // step → result
			} else {
				const err = await res.json().catch(() => ({ message: 'Import failed' }));
				wizard.error = err.message ?? 'Import failed';
			}
		} catch {
			wizard.error = 'Import failed — please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal {open} title={stepTitles[wizard.step]} width={640} onclose={() => onOpenChange(false)}>
	{#if wizard.step === 'source'}
		<SourceStep />
	{:else if wizard.step === 'target'}
		<TargetStep />
	{:else if wizard.step === 'mapping'}
		<MappingStep />
	{:else if wizard.step === 'preview'}
		<PreviewStep />
	{:else if wizard.step === 'result'}
		<ResultStep />
	{/if}

	{#snippet footer()}
		<div class="flex w-full items-center justify-between">
			<div>
				{#if wizard.step !== 'source' && wizard.step !== 'result'}
					<Button variant="ghost" size="sm" disabled={busy} onclick={() => wizard.back()}>
						Back
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				{#if wizard.step === 'target'}
					<Button size="sm" disabled={busy} onclick={() => wizard.advance()}>Next</Button>
				{:else if wizard.step === 'mapping'}
					<Button size="sm" disabled={busy || !wizard.canAdvance()} onclick={onMappingNext}>
						Next
					</Button>
				{:else if wizard.step === 'preview'}
					<Button size="sm" disabled={busy} onclick={onCommit}>Import</Button>
				{:else if wizard.step === 'result'}
					<Button size="sm" onclick={() => onOpenChange(false)}>Done</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>
