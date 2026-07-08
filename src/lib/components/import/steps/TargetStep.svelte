<script lang="ts">
	import { getImportWizard } from '../import-wizard-state.svelte';
	import type { ImportTarget } from '$lib/utils/import-mapping';

	const wizard = getImportWizard();

	const options: { value: ImportTarget; label: string; hint: string }[] = [
		{
			value: 'leads',
			label: 'Leads',
			hint: 'Create new leads (unassigned, source: sheet import).'
		},
		{ value: 'organizers', label: 'Organizers', hint: 'Create or link recurring organizers.' }
	];
</script>

<div class="flex flex-col gap-3">
	<h3 class="text-[14px] font-semibold text-ink">What are you importing?</h3>
	<div class="flex flex-col gap-2" role="radiogroup" aria-label="Import target">
		{#each options as opt (opt.value)}
			<button
				type="button"
				role="radio"
				aria-checked={wizard.target === opt.value}
				class="flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition {wizard.target ===
				opt.value
					? 'border-primary bg-selected'
					: 'border-hairline bg-panel hover:bg-panel-sunken'}"
				onclick={() => wizard.setTarget(opt.value)}
			>
				<span class="text-[13.5px] font-semibold text-ink">{opt.label}</span>
				<span class="text-[12px] text-ink-500">{opt.hint}</span>
			</button>
		{/each}
	</div>
</div>
