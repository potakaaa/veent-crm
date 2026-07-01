import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { computeAppealScore } from '$lib/appeal-score';

// STUB: needs_review=true leads to clean up post-import (blank page name, recovered un-numbered
// rows, unknown/org-name category). Reused by scraper intake for low-confidence rows.
export const load: PageServerLoad = async () => {
	const leads = MOCK_LEADS.filter((l) => l.needsReview).map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.announcedAt, l.firstReachedOutAt)
	}));
	return { leads };
};
