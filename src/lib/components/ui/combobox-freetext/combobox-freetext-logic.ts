/**
 * Pure, DOM-free helpers encoding the "suggest but NEVER block free-text" contract
 * for `ComboboxFreetext.svelte`. These are unit-testable under the existing `node`
 * vitest project (no browser/happy-dom needed) and carry the AC5 invariant in code:
 *
 *   The component NEVER derives an error/invalid state from whether the current
 *   value matches a suggestion. The typed free-text value is always forwarded
 *   unchanged; selecting a suggestion replaces the value with the EXACT picked
 *   string.
 *
 * See combobox-suggest-freetext_PLAN_07-07-26.md §Section A.
 */

/**
 * Decide whether the suggestion dropdown should be shown.
 *
 * False when there is no `search` source (free-text-only mode) OR when the source
 * returned zero results. This is the ONLY gate on dropdown visibility — it is
 * intentionally independent of whether `value` matches any result, so a typed
 * value that matches nothing never suppresses (or forces) the dropdown based on
 * "match" status.
 */
export function shouldShowDropdown(hasSearch: boolean, results: readonly string[]): boolean {
	return hasSearch && results.length > 0;
}

/**
 * Result of selecting a suggestion: the value becomes the EXACT picked string
 * (no reformatting, no partial merge) and the dropdown closes.
 *
 * `current` is accepted for symmetry/testability and to document that the prior
 * typed value is discarded in favor of the exact selection — it is intentionally
 * not read.
 */
export function applySelection(_current: string, picked: string): { value: string; open: false } {
	return { value: picked, open: false };
}

/**
 * AC5 invariant, encoded as testable code: the component derives NO invalid/error
 * state from whether `value` matches a suggestion. This function ALWAYS returns
 * false regardless of inputs — any free-text value (matched or unmatched) is valid
 * as far as this component is concerned. Downstream form validation (e.g. the lead
 * name `z.string().trim().min(1)`) is a separate concern and unaffected.
 */
export function isValueInvalidFromMatch(_value: string, _results: readonly string[]): false {
	return false;
}

/**
 * Latest-wins request-generation counter (copied recipe from OrganizerCombobox.svelte).
 * Each fetch increments the shared counter and captures its own generation; a
 * response whose captured generation is no longer the latest is dropped as stale.
 *
 * Usage:
 *   const gen = tracker.next();
 *   const data = await fetch(...);
 *   if (tracker.isStale(gen)) return; // out-of-order response, drop it
 */
export function createRequestGen(): {
	next: () => number;
	isStale: (gen: number) => boolean;
	current: () => number;
} {
	let requestGen = 0;
	return {
		next: () => ++requestGen,
		isStale: (gen: number) => gen !== requestGen,
		current: () => requestGen
	};
}
