/**
 * Dedup helpers. Dedup is ADVISORY ONLY — it surfaces likely duplicates but
 * never blocks saving and never merges records (product rule).
 */
import type { Lead } from '$lib/types';

export const normalize = (s: string): string =>
	s
		.toLowerCase()
		.replace(/^@/, '')
		.replace(/[^a-z0-9]/g, '')
		.trim();

/** Find leads whose name or handle look like a match for the query. */
export function findDuplicates(query: string, leads: Lead[], limit = 5): Lead[] {
	const q = normalize(query);
	if (q.length < 2) return [];
	return leads
		.filter((l) => normalize(l.name).includes(q) || normalize(l.handle).includes(q))
		.slice(0, limit);
}

/** Does a candidate name/handle collide with any existing lead? (advisory) */
export function hasPotentialDuplicate(
	candidate: { name?: string; handle?: string },
	leads: Lead[]
): Lead[] {
	const matches = new Map<string, Lead>();
	for (const key of [candidate.name, candidate.handle].filter(Boolean) as string[]) {
		for (const l of findDuplicates(key, leads)) matches.set(l.id, l);
	}
	return [...matches.values()];
}
