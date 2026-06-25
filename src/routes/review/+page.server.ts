import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';

// STUB: needs_review=true leads to clean up post-import (blank page name, recovered un-numbered
// rows, unknown/org-name category). Reused by scraper intake for low-confidence rows.
export const load: PageServerLoad = async () => {
	return { leads: MOCK_LEADS.filter((l) => l.needsReview) };
};
