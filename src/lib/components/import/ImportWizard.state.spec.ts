// NOTE: named `.state.spec.ts` (NOT `.svelte.spec.ts`) so the node vitest `server` project picks
// it up — the project excludes `src/**/*.svelte.{test,spec}.ts`. It still imports the rune-based
// `.svelte.ts` state module, which the sveltekit vite plugin compiles.
import { describe, it, expect } from 'vitest';
import { ImportWizardState } from './import-wizard-state.svelte';
import type { PreviewRow } from '$lib/utils/import-mapping';

function pr(index: number, isDuplicate = false): PreviewRow {
	return {
		index,
		data: { name: `row-${index}` },
		normalizedHandle: `row-${index}`,
		sourceRef: null,
		isDuplicate
	};
}

describe('ImportWizardState (wizard-state class)', () => {
	it('gates step advance on the current step validation', () => {
		const w = new ImportWizardState();
		expect(w.step).toBe('source');
		// No data loaded → cannot advance.
		expect(w.canAdvance()).toBe(false);
		expect(w.advance()).toBe(false);

		w.loadParsed(['name'], [['Acme']]);
		expect(w.canAdvance()).toBe(true);
		expect(w.advance()).toBe(true);
		expect(w.step).toBe('target');
	});

	it('locked+defaultTarget suppresses the target step and keeps target immutable (AC12)', () => {
		const w = new ImportWizardState({ defaultTarget: 'organizers', locked: true });
		expect(w.target).toBe('organizers');
		w.setTarget('leads');
		expect(w.target).toBe('organizers'); // immutable when locked

		w.loadParsed(['name'], [['Acme']]);
		w.advance();
		// Locked wizard skips straight from source → mapping, never 'target'.
		expect(w.step).toBe('mapping');
	});

	it('unlocked wizard passes through the target step and allows target change', () => {
		const w = new ImportWizardState();
		w.setTarget('organizers');
		expect(w.target).toBe('organizers');
		w.loadParsed(['name'], [['Acme']]);
		w.advance();
		expect(w.step).toBe('target');
	});

	it('toggleRowSkip mutates only the targeted row', () => {
		const w = new ImportWizardState();
		w.previewRows = [pr(0), pr(1), pr(2)];
		w.toggleRowSkip(1);
		expect(w.isSkipped(0)).toBe(false);
		expect(w.isSkipped(1)).toBe(true);
		expect(w.isSkipped(2)).toBe(false);
	});

	it('applyDuplicateFlags pre-skips flagged rows; toggleAllFlagged bulk-controls them', () => {
		const w = new ImportWizardState();
		w.applyDuplicateFlags([pr(0, true), pr(1, false), pr(2, true)]);
		expect(w.isSkipped(0)).toBe(true);
		expect(w.isSkipped(1)).toBe(false);
		expect(w.isSkipped(2)).toBe(true);

		w.toggleAllFlagged(false);
		expect(w.isSkipped(0)).toBe(false);
		expect(w.isSkipped(2)).toBe(false);
		expect(w.isSkipped(1)).toBe(false);
	});

	it('commitRows carries mapped data plus the final skip choice', () => {
		const w = new ImportWizardState();
		w.previewRows = [pr(0), pr(1)];
		w.toggleRowSkip(1);
		const payload = w.commitRows();
		expect(payload).toEqual([
			{ data: { name: 'row-0' }, skip: false },
			{ data: { name: 'row-1' }, skip: true }
		]);
	});
});
