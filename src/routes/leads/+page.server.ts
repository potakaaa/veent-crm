import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { computeAppealScore } from '$lib/appeal-score';

// STUB: default view = fresh-first, excludes lost. Real impl: Drizzle query + pg_trgm search +
// stage/owner/category/platform filters + stale (>30d) filter. SVAR DataGrid renders this.
export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').toLowerCase();
	const sort = url.searchParams.get('sort');

	let leads = MOCK_LEADS.filter((l) => l.stage !== 'lost');
	if (q) leads = leads.filter((l) => l.name.toLowerCase().includes(q));

	let scored = leads.map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.announcedAt, l.firstReachedOutAt)
	}));

	if (sort === 'appeal') {
		// score desc, null scores forced to the bottom
		scored = [...scored].sort((a, b) => {
			if (a.appealScore == null && b.appealScore == null) return 0;
			if (a.appealScore == null) return 1;
			if (b.appealScore == null) return -1;
			return b.appealScore - a.appealScore;
		});
	} else {
		scored = [...scored].sort((a, b) =>
			(b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
		);
	}

	return { leads: scored, q, sort };
};
