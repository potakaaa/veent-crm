<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { getImportWizard } from '../import-wizard-state.svelte';
	import { parseCsvText } from '$lib/utils/import-parse';
	import {
		buildSheetsExportUrl,
		fetchSheetAsCsvText,
		SheetNotAccessibleError
	} from '$lib/utils/import-sheets-fetch';

	const wizard = getImportWizard();

	let sheetUrl = $state('');
	let loading = $state(false);

	function loadCsvText(text: string) {
		const { headers, rows } = parseCsvText(text);
		if (headers.length === 0 || rows.length === 0) {
			wizard.error = 'That file has no readable header row or data rows.';
			return;
		}
		wizard.loadParsed(headers, rows);
		wizard.advance();
	}

	async function onFileChange(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		wizard.error = null;
		loading = true;
		try {
			const text = await file.text();
			loadCsvText(text);
		} catch {
			wizard.error = 'Could not read that file.';
		} finally {
			loading = false;
		}
	}

	async function onLoadSheet() {
		wizard.error = null;
		const exportUrl = buildSheetsExportUrl(sheetUrl);
		if (!exportUrl) {
			wizard.error = 'That does not look like a Google Sheets link.';
			return;
		}
		loading = true;
		try {
			const text = await fetchSheetAsCsvText(exportUrl);
			loadCsvText(text);
		} catch (err) {
			wizard.error =
				err instanceof SheetNotAccessibleError ? err.message : 'Could not load that Google Sheet.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col gap-5">
	<div>
		<h3 class="text-[14px] font-semibold text-ink">Upload a CSV file</h3>
		<p class="mt-1 text-[12.5px] text-ink-500">Choose a .csv export from your computer.</p>
		<input
			type="file"
			accept=".csv,text/csv"
			class="mt-2 block w-full text-[13px] text-ink-700 file:mr-3 file:rounded-md file:border file:border-hairline file:bg-panel file:px-3 file:py-1.5 file:text-[12.5px]"
			disabled={loading}
			onchange={onFileChange}
		/>
	</div>

	<div class="flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-300">
		<span class="h-px flex-1 bg-hairline"></span>or<span class="h-px flex-1 bg-hairline"></span>
	</div>

	<div>
		<h3 class="text-[14px] font-semibold text-ink">Paste a Google Sheets link</h3>
		<p class="mt-1 text-[12.5px] text-ink-500">
			The sheet must be shared as "Anyone with the link can view".
		</p>
		<div class="mt-2 flex gap-2">
			<Input
				bind:value={sheetUrl}
				placeholder="https://docs.google.com/spreadsheets/d/…"
				class="h-9 flex-1"
			/>
			<Button size="sm" disabled={loading || !sheetUrl} onclick={onLoadSheet}>Load</Button>
		</div>
	</div>

	{#if wizard.error}
		<p class="text-[12.5px] text-red-500" role="alert">{wizard.error}</p>
	{/if}
</div>
