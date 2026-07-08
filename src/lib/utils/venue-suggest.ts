/**
 * Venue-name suggestion fetcher for the ComboboxFreetext `search` prop.
 *
 * Reuses `GET /api/meetings/venues?q=` (session-authed) — returns `{ venues: string[] }` of
 * DISTINCT past venue names. Errors resolve to an empty list so the venue field always stays
 * usable as plain free-text (never blocks). Mirrors organizer-suggest.ts (GitHub #249, MTG-5).
 */
export async function fetchVenueSuggestions(q: string): Promise<string[]> {
	try {
		const res = await fetch(`/api/meetings/venues?q=${encodeURIComponent(q)}`);
		if (!res.ok) return [];
		const data = (await res.json()) as { venues: string[] };
		return data.venues ?? [];
	} catch {
		return [];
	}
}
