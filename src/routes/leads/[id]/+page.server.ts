import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { MOCK_LEADS, MOCK_ACTIVITIES } from '$lib/server/mock';
import { computeAppealScore } from '$lib/appeal-score';

// STUB: real impl loads the lead + its activity timeline + history from Drizzle.
export const load: PageServerLoad = async ({ params }) => {
	const found = MOCK_LEADS.find((l) => l.id === params.id);
	if (!found) throw error(404, 'Lead not found');
	const lead = {
		...found,
		appealScore: computeAppealScore(found.eventDate, found.announcedAt, found.firstReachedOutAt)
	};
	const activities = MOCK_ACTIVITIES.filter((a) => a.leadId === lead.id);
	return { lead, activities };
};
