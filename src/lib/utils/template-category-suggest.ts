/**
 * Template-category suggestion filter for the ComboboxFreetext `search` prop.
 *
 * Pure client-side, case-insensitive substring filter over the frozen TEMPLATE_CATEGORIES
 * list (CAT-1). Wrapped in Promise.resolve to satisfy ComboboxFreetext's
 * `search?: (q: string) => Promise<string[]>` contract, even though there is no network
 * call — the list is a static 20-item constant. See GitHub #274.
 */
import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';

export function filterTemplateCategories(q: string): Promise<string[]> {
	const query = q.trim().toLowerCase();
	if (query === '') return Promise.resolve([...TEMPLATE_CATEGORIES]);
	return Promise.resolve(TEMPLATE_CATEGORIES.filter((c) => c.toLowerCase().includes(query)));
}
