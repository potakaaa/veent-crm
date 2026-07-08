// Rune-based wizard state class for the shared ImportWizard. Exposed via setContext/getContext
// (mirrors src/lib/components/ui/sidebar/context.svelte.ts). Holds the full wizard flow: current
// step, source/target choice, parsed rows, column mapping, per-row skip/import choices, and the
// final result summary. A fresh instance is created per wizard open so rows never leak between
// imports.

import { getContext, setContext } from 'svelte';
import {
	buildPreviewRows,
	validateMapping,
	type ColumnMapping,
	type ImportTarget,
	type PreviewRow,
	type CommitSummary
} from '$lib/utils/import-mapping';

export type WizardStep = 'source' | 'target' | 'mapping' | 'preview' | 'result';

export interface ImportWizardInit {
	defaultTarget?: ImportTarget;
	locked?: boolean;
}

export class ImportWizardState {
	step = $state<WizardStep>('source');
	readonly locked: boolean;
	target = $state<ImportTarget>('leads');
	headers = $state<string[]>([]);
	rows = $state<string[][]>([]);
	mapping = $state<ColumnMapping>({});
	previewRows = $state<PreviewRow[]>([]);
	// Per-preview-row skip choice, keyed by preview-row index.
	skipChoices = $state<Record<number, boolean>>({});
	result = $state<CommitSummary | null>(null);
	error = $state<string | null>(null);

	private readonly defaultTarget: ImportTarget;

	constructor(init: ImportWizardInit = {}) {
		this.locked = init.locked ?? false;
		this.defaultTarget = init.defaultTarget ?? 'leads';
		this.target = this.defaultTarget;
	}

	/**
	 * Restore the wizard to its initial state. Called when the modal transitions closed→open so
	 * rows/mapping/result never leak from a prior import (setContext is init-only, so a single
	 * instance is reset rather than re-created).
	 */
	reset() {
		this.step = 'source';
		this.target = this.defaultTarget;
		this.headers = [];
		this.rows = [];
		this.mapping = {};
		this.previewRows = [];
		this.skipChoices = {};
		this.result = null;
		this.error = null;
	}

	/** Set the import target. No-op when the wizard is locked to a fixed target (AC12). */
	setTarget(target: ImportTarget) {
		if (this.locked) return;
		this.target = target;
	}

	/** Load parsed CSV/Sheet data and advance to the target (or mapping, if locked) step. */
	loadParsed(headers: string[], rows: string[][]) {
		this.headers = headers;
		this.rows = rows;
		this.mapping = {};
		this.error = null;
	}

	/** Whether the current step's data is valid enough to advance. */
	canAdvance(): boolean {
		switch (this.step) {
			case 'source':
				return this.headers.length > 0 && this.rows.length > 0;
			case 'target':
				return true;
			case 'mapping':
				return validateMapping(this.mapping, this.target).valid;
			case 'preview':
				return this.previewRows.length > 0;
			case 'result':
				return false;
		}
	}

	/** Advance to the next step when the current step is valid. Returns true if it advanced. */
	advance(): boolean {
		if (!this.canAdvance()) return false;
		switch (this.step) {
			case 'source':
				this.step = this.locked ? 'mapping' : 'target';
				return true;
			case 'target':
				this.step = 'mapping';
				return true;
			case 'mapping':
				this.previewRows = buildPreviewRows(
					this.rows,
					this.headers,
					this.mapping,
					this.target
				);
				this.skipChoices = {};
				// Default: skip flagged duplicates (user can re-include). Applied after dedup flags
				// arrive from the server; here we start with the current (un-flagged) preview.
				this.step = 'preview';
				return true;
			case 'preview':
				this.step = 'result';
				return true;
			case 'result':
				return false;
		}
	}

	/** Move back one step (never past source; skips the target step when locked). */
	back() {
		switch (this.step) {
			case 'target':
				this.step = 'source';
				break;
			case 'mapping':
				this.step = this.locked ? 'source' : 'target';
				break;
			case 'preview':
				this.step = 'mapping';
				break;
			default:
				break;
		}
	}

	/** Toggle the skip/import choice for exactly one preview row. */
	toggleRowSkip(index: number) {
		const current = this.skipChoices[index] ?? false;
		this.skipChoices = { ...this.skipChoices, [index]: !current };
	}

	/** Bulk skip (or unskip) every currently-flagged duplicate row. */
	toggleAllFlagged(skip: boolean) {
		const next = { ...this.skipChoices };
		for (const row of this.previewRows) {
			if (row.isDuplicate) next[row.index] = skip;
		}
		this.skipChoices = next;
	}

	/** Whether a given preview row is currently marked to be skipped. */
	isSkipped(index: number): boolean {
		return this.skipChoices[index] ?? false;
	}

	/** Apply server-computed duplicate flags onto the preview rows and pre-skip the duplicates. */
	applyDuplicateFlags(flagged: PreviewRow[]) {
		this.previewRows = flagged;
		const next = { ...this.skipChoices };
		for (const row of flagged) {
			if (row.isDuplicate && next[row.index] === undefined) next[row.index] = true;
		}
		this.skipChoices = next;
	}

	/** Build the commit payload rows (mapped data + final skip choice) for POST /api/import/commit. */
	commitRows(): Array<{ data: Record<string, string>; skip: boolean }> {
		return this.previewRows.map((row) => ({
			data: row.data,
			skip: this.isSkipped(row.index)
		}));
	}
}

const IMPORT_WIZARD_KEY = Symbol('import-wizard');

export function setImportWizard(init: ImportWizardInit = {}): ImportWizardState {
	return setContext(IMPORT_WIZARD_KEY, new ImportWizardState(init));
}

export function getImportWizard(): ImportWizardState {
	return getContext(IMPORT_WIZARD_KEY);
}
