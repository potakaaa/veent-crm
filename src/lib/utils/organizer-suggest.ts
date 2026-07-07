/**
 * Organizer-name suggestion fetcher for the ComboboxFreetext `search` prop.
 *
 * Reuses the already-live `GET /api/organizers?q=` endpoint (session-authed) — do NOT
 * build a new endpoint. The endpoint returns `{ organizers: { id, name }[] }`; for
 * free-text organizer-name suggestions the id is irrelevant, so we map to name-only and
 * dedupe. Errors resolve to an empty list so the field always stays usable as plain
 * free-text (never blocks). See combobox-suggest-freetext_PLAN_07-07-26.md §Section B.
 */
export async function fetchOrganizerNames(q: string): Promise<string[]> {
	try {
		const res = await fetch(`/api/organizers?q=${encodeURIComponent(q)}`);
		if (!res.ok) return [];
		const data = (await res.json()) as { organizers: { id: string; name: string }[] };
		const seen = new Set<string>();
		const names: string[] = [];
		for (const o of data.organizers) {
			if (o.name && !seen.has(o.name)) {
				seen.add(o.name);
				names.push(o.name);
			}
		}
		return names;
	} catch {
		return [];
	}
}
