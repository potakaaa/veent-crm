import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { computeAppealScore, sortByAppealScore } from '$lib/appeal-score';

// STUB: "Up for grabs" pool = owner_id IS NULL, not lost. Real impl: race-safe atomic claim
// (SET owner_id WHERE owner_id IS NULL), bulk-claim, manager bulk-assign, filter by source.
export const load: PageServerLoad = async ({ url }) => {
	const sort = url.searchParams.get('sort');

	let leads = MOCK_LEADS.filter((l) => l.ownerName === null && l.stage !== 'lost').map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.announcedAt, l.firstReachedOutAt)
	}));

	if (sort === 'appeal') {
		leads = sortByAppealScore(leads);
	}

	return { leads, sort };
};
