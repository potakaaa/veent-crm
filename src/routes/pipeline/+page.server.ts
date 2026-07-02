import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { LEAD_STAGES } from '$lib/zod/schemas';
import { computeAppealScore, sortByAppealScore } from '$lib/appeal-score';

// STUB: kanban columns by stage. Real impl supports drag-to-move + quick-assign + Won prompt.
export const load: PageServerLoad = async ({ url }) => {
	const sort = url.searchParams.get('sort');

	const columns = LEAD_STAGES.map((stage) => {
		let leads = MOCK_LEADS.filter((l) => l.stage === stage).map((l) => ({
			...l,
			appealScore: computeAppealScore(l.eventDate, l.announcedAt, l.firstReachedOutAt)
		}));

		if (sort === 'appeal') {
			// sort within each column
			leads = sortByAppealScore(leads);
		}

		return { stage, leads };
	});

	return { columns, sort };
};
