import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { computeAppealScore } from '$lib/appeal-score';

// STUB: "Up for grabs" pool = owner_id IS NULL, not lost. Real impl: race-safe atomic claim
// (SET owner_id WHERE owner_id IS NULL), bulk-claim, manager bulk-assign, filter by source.
export const load: PageServerLoad = async ({ url }) => {
	const sort = url.searchParams.get('sort');

	let leads = MOCK_LEADS.filter((l) => l.ownerName === null && l.stage !== 'lost').map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.announcedAt, l.firstReachedOutAt)
	}));

	if (sort === 'appeal') {
		// score desc, null scores forced to the bottom
		leads = [...leads].sort((a, b) => {
			if (a.appealScore == null && b.appealScore == null) return 0;
			if (a.appealScore == null) return 1;
			if (b.appealScore == null) return -1;
			return b.appealScore - a.appealScore;
		});
	}

	return { leads, sort };
};
