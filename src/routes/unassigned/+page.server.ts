import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';

// STUB: "Up for grabs" pool = owner_id IS NULL, not lost. Real impl: race-safe atomic claim
// (SET owner_id WHERE owner_id IS NULL), bulk-claim, manager bulk-assign, filter by source.
export const load: PageServerLoad = async () => {
	const leads = MOCK_LEADS.filter((l) => l.ownerName === null && l.stage !== 'lost');
	return { leads };
};
