/**
 * Pure, framework-free pipeline search predicate — PIPE-3.
 *
 * `matchesQuery` decides whether a lead card should stay visible for a given
 * search term. It runs entirely on the client over already-loaded cards
 * (case-insensitive substring across lead name / organizer name / event name).
 * No Svelte or DB imports, so it is unit-testable in this repo's node-only
 * vitest project — mirrors the `search-input.ts` colocated-pure-logic precedent.
 */
import type { Lead } from '$lib/types';

/**
 * Returns true when `lead` matches `query`. An empty or whitespace-only query
 * matches every lead (show-all default). Match is a case-insensitive substring
 * over `name`, `organizerName`, and `eventName`; undefined optional fields
 * coalesce to `''` so they never throw.
 */
export function matchesQuery(
	lead: Pick<Lead, 'name' | 'organizerName' | 'eventName'>,
	query: string
): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') return true;
	const haystacks = [lead.name, lead.organizerName ?? '', lead.eventName ?? ''];
	return haystacks.some((field) => field.toLowerCase().includes(q));
}
