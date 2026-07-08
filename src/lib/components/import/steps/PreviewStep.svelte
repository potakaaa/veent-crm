<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { getImportWizard } from '../import-wizard-state.svelte';

	const wizard = getImportWizard();

	// Fields actually mapped (column order preserved) — used as the preview table columns.
	const columns = $derived([...new Set(Object.values(wizard.mapping).filter((f) => f))]);
	const flaggedCount = $derived(wizard.previewRows.filter((r) => r.isDuplicate).length);
</script>

<div class="flex flex-col gap-3">
	{#if wizard.error}
		<p class="text-[12.5px] text-amber-600" role="alert">{wizard.error}</p>
	{/if}
	<div class="flex items-center justify-between">
		<h3 class="text-[14px] font-semibold text-ink">
			Preview ({wizard.previewRows.length} rows)
		</h3>
		{#if flaggedCount > 0}
			<div class="flex items-center gap-2">
				<span class="text-[12px] text-ink-500">{flaggedCount} possible duplicates</span>
				<Button size="sm" variant="outline" onclick={() => wizard.toggleAllFlagged(true)}>
					Skip all
				</Button>
				<Button size="sm" variant="outline" onclick={() => wizard.toggleAllFlagged(false)}>
					Import all
				</Button>
			</div>
		{/if}
	</div>

	<div class="max-h-[340px] overflow-auto rounded-lg border border-hairline">
		<table class="w-full text-[12.5px]">
			<thead class="bg-panel-sunken text-left text-[11px] uppercase tracking-wide text-ink-400">
				<tr>
					<th class="px-2.5 py-2 font-medium">Import</th>
					{#each columns as col (col)}
						<th class="px-2.5 py-2 font-medium">{col}</th>
					{/each}
					<th class="px-2.5 py-2 font-medium">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each wizard.previewRows as row (row.index)}
					<tr class="border-t border-hairline" class:opacity-50={wizard.isSkipped(row.index)}>
						<td class="px-2.5 py-1.5">
							<input
								type="checkbox"
								aria-label="Import this row"
								checked={!wizard.isSkipped(row.index)}
								onchange={() => wizard.toggleRowSkip(row.index)}
							/>
						</td>
						{#each columns as col (col)}
							<td class="px-2.5 py-1.5 text-ink-700">{row.data[col] ?? ''}</td>
						{/each}
						<td class="px-2.5 py-1.5">
							{#if row.isDuplicate}
								<Badge variant="outline">Duplicate</Badge>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
