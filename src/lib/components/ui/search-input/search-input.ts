/**
 * Shared search-input logic — unified-filter-components plan.
 *
 * Pure, framework-free debounce factory (no Svelte imports) so the debounce
 * timing is unit-testable via `vi.useFakeTimers()` in this repo's node-only
 * vitest project. `SearchInput.svelte` imports and calls `createDebouncer`
 * rather than re-implementing `setTimeout` per page — mirrors the
 * `field-error.ts` precedent.
 */

/**
 * Canonical debounce delay for search-as-you-type across the app.
 * Locked at 300ms by the unified-filter-components INNOVATE decision
 * (reverses SPEC's tentative 1300ms — no rate-limit/cost rationale existed;
 * 300ms is already proven in-repo on My Leads).
 */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Returns a debounced wrapper around `callback`. Each call resets the timer;
 * the callback fires once, `ms` after the last call.
 */
export function createDebouncer(
	callback: (value: string) => void,
	ms: number = DEFAULT_DEBOUNCE_MS
): (value: string) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (value: string) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => callback(value), ms);
	};
}
