<script lang="ts">
	import { getImportWizard } from '../import-wizard-state.svelte';
	import { fieldsForTarget, validateMapping } from '$lib/utils/import-mapping';

	const wizard = getImportWizard();
	const fields = $derived(fieldsForTarget(wizard.target));
	const validation = $derived(validateMapping(wizard.mapping, wizard.target));

	function setColumn(header: string, e: Event & { currentTarget: HTMLSelectElement }) {
		wizard.mapping = { ...wizard.mapping, [header]: e.currentTarget.value };
	}
</script>

<div class="flex flex-col gap-3">
	<h3 class="text-[14px] font-semibold text-ink">Map your columns</h3>
	<p class="text-[12.5px] text-ink-500">
		Match each column to a CRM field. Leave columns you don't need set to "Don't import".
	</p>

	<div class="max-h-[320px] overflow-y-auto rounded-lg border border-hairline">
		<table class="w-full text-[13px]">
			<thead class="bg-panel-sunken text-left text-[11px] uppercase tracking-wide text-ink-400">
				<tr>
					<th class="px-3 py-2 font-medium">Column</th>
					<th class="px-3 py-2 font-medium">CRM field</th>
				</tr>
			</thead>
			<tbody>
				{#each wizard.headers as header, i (i)}
					<tr class="border-t border-hairline">
						<td class="px-3 py-2 font-medium text-ink">{header || `Column ${i + 1}`}</td>
						<td class="px-3 py-2">
							<select
								class="h-8 w-full rounded-md border border-hairline bg-panel px-2 text-[12.5px]"
								value={wizard.mapping[header] ?? ''}
								onchange={(e) => setColumn(header, e)}
							>
								<option value="">Don't import</option>
								{#each fields as f (f.key)}
									<option value={f.key}>{f.label}</option>
								{/each}
							</select>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if !validation.valid}
		<p class="text-[12.5px] text-red-500" role="alert">{validation.reason}</p>
	{/if}
</div>
