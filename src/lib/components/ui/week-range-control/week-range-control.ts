/**
 * Shared week-range-control logic — unified-filter-components plan.
 *
 * Pure, framework-free helpers (no Svelte imports) so the preset-selection /
 * ARIA derivation is unit-testable in this repo's node-only vitest project.
 * `WeekRangeControl.svelte` imports and calls these — mirrors the
 * `field-error.ts` precedent.
 *
 * `activeValue === null` means the "All" (no upper-bound) option is active.
 */

/** True when a preset button should render `aria-pressed="true"`. */
export function computeAriaPressed(presetValue: number, activeValue: number | null): boolean {
	return activeValue !== null && activeValue === presetValue;
}

/** True when the "All" button should render `aria-pressed="true"`. */
export function isAllActive(activeValue: number | null): boolean {
	return activeValue === null;
}
