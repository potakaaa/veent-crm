/**
 * Pure helpers for the optimistic-update pattern used across the CRM.
 *
 * The canonical flow on every optimistic page is:
 *   1. capture `snapshot = shadow` (the current shadow list/record)
 *   2. set `shadow = applyOptimistic(shadow, ...)` immediately (UI updates at once)
 *   3. await the server call
 *   4. on failure: `shadow = snapshot` (rollback) + toast
 *   5. on success: `await invalidateAll()`; a `$effect(() => shadow = data.list)`
 *      re-syncs the shadow to server truth (see reconcile() semantics).
 *
 * These functions are intentionally pure and immutable so they can be unit-tested
 * in isolation (src/tests/optimistic.spec.ts) without any Svelte/DOM dependency.
 */

/** Identifiable record — every list item the CRM optimistically mutates has a string id. */
export interface Identifiable {
	id: string;
}

/**
 * Return a NEW list with the item matching `id` removed.
 * Does not mutate the input (the captured snapshot stays intact for rollback).
 */
export function removeFromList<T extends Identifiable>(list: readonly T[], id: string): T[] {
	return list.filter((item) => item.id !== id);
}

/**
 * Return a NEW list with the item matching `id` shallow-patched.
 * Does not mutate the input.
 */
export function patchInList<T extends Identifiable>(
	list: readonly T[],
	id: string,
	patch: Partial<T>
): T[] {
	return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/**
 * Return a NEW record shallow-patched with `patch`. Does not mutate the input.
 * Used for single-record optimistic updates (e.g. lead detail stage/owner).
 */
export function patchRecord<T>(record: T, patch: Partial<T>): T {
	return { ...record, ...patch };
}

/**
 * Reconcile a local optimistic shadow with fresh server data after invalidateAll().
 * Server truth always wins — this is what the `$effect` re-sync expresses.
 */
export function reconcile<T>(_shadow: T, server: T): T {
	return server;
}
