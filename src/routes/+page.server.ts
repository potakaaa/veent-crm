import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';

// STUB load — derive a few headline tiles from mock leads. Replace with real aggregate queries.
export const load: PageServerLoad = async () => {
	const won = MOCK_LEADS.filter((l) => l.stage === 'won').length;
	const unassigned = MOCK_LEADS.filter((l) => l.ownerName === null && l.stage !== 'lost').length;
	const needsReview = MOCK_LEADS.filter((l) => l.needsReview).length;
	return {
		tiles: [
			{ label: 'Won', value: won },
			{ label: 'Up for grabs', value: unassigned },
			{ label: 'Needs review', value: needsReview },
			{ label: 'Due today', value: 0 }
		]
	};
};
