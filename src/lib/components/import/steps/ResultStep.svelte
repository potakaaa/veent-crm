<script lang="ts">
	import { getImportWizard } from '../import-wizard-state.svelte';

	const wizard = getImportWizard();
	const result = $derived(wizard.result);
</script>

<div class="flex flex-col gap-4">
	<h3 class="text-[14px] font-semibold text-ink">Import complete</h3>

	{#if result}
		<div class="grid grid-cols-3 gap-3">
			<div class="rounded-lg border border-hairline bg-panel p-3 text-center">
				<div class="text-[22px] font-bold text-ink">{result.created}</div>
				<div class="text-[11px] uppercase tracking-wide text-ink-400">Created</div>
			</div>
			<div class="rounded-lg border border-hairline bg-panel p-3 text-center">
				<div class="text-[22px] font-bold text-ink">{result.skipped}</div>
				<div class="text-[11px] uppercase tracking-wide text-ink-400">Skipped</div>
			</div>
			<div class="rounded-lg border border-hairline bg-panel p-3 text-center">
				<div class="text-[22px] font-bold text-ink">{result.errored}</div>
				<div class="text-[11px] uppercase tracking-wide text-ink-400">Errored</div>
			</div>
		</div>

		{#if result.errors.length > 0}
			<div class="max-h-[220px] overflow-y-auto rounded-lg border border-hairline">
				<table class="w-full text-[12.5px]">
					<thead class="bg-panel-sunken text-left text-[11px] uppercase tracking-wide text-ink-400">
						<tr>
							<th class="px-3 py-2 font-medium">Row</th>
							<th class="px-3 py-2 font-medium">Error</th>
						</tr>
					</thead>
					<tbody>
						{#each result.errors as err (err.index)}
							<tr class="border-t border-hairline">
								<td class="px-3 py-1.5 text-ink-700">{err.index + 1}</td>
								<td class="px-3 py-1.5 text-red-500">{err.message}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<p class="text-[13px] text-ink-500">No result available.</p>
	{/if}
</div>
