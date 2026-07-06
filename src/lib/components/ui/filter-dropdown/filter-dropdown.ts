/**
 * Shared filter-dropdown logic — unified-filter-components plan.
 *
 * Pure, framework-free helpers (no Svelte imports) so the single-vs-multi
 * selection branch is unit-testable in this repo's node-only vitest project
 * (no jsdom / component-render harness exists). `FilterDropdown.svelte` imports
 * and calls `toggleOption` rather than inlining the branch — mirrors the
 * `field-error.ts` / `field-error.spec.ts` precedent.
 */

/**
 * An option may be a bare string (value === label) or an explicit
 * `{ value, label }` pair for the value≠label cases (My Leads Stage uses a
 * stage key + human label; Reports rep uses a user id + name).
 */
export type FilterOption = string | { value: string; label: string };

/** The value stored/emitted for an option. */
export function optionValue(option: FilterOption): string {
	return typeof option === 'string' ? option : option.value;
}

/** The human-visible label for an option. */
export function optionLabel(option: FilterOption): string {
	return typeof option === 'string' ? option : option.label;
}

/**
 * Core selection branch shared by both cardinalities.
 *
 * - `multiple = true`  → array toggle-and-stay-open: add the value if absent,
 *   remove it if already present. Preserves the current MultiSelectFilter
 *   multi-select contract exactly.
 * - `multiple = false` → select-and-close: the returned selection is ALWAYS
 *   exactly the newly clicked value (never accumulates, always cardinality 1).
 *   Clearing back to "none" is a separate action (the Clear button emits '').
 *   This is the single-select cardinality-regression guard for My Leads
 *   Stage/Platform/Country.
 */
export function toggleOption(
	multiple: boolean,
	current: string[] | string,
	value: string
): string[] | string {
	if (multiple) {
		const arr = Array.isArray(current) ? current : current ? [current] : [];
		return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
	}
	// Single-select: replace, never append. Always exactly one active value.
	return value;
}

/** Trigger display for single-select: the active option's label, or the fallback label. */
export function singleTriggerLabel(
	fallbackLabel: string,
	options: readonly FilterOption[],
	selected: string
): string {
	if (!selected) return fallbackLabel;
	const match = options.find((o) => optionValue(o) === selected);
	return match ? optionLabel(match) : fallbackLabel;
}
