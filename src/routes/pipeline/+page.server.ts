import type { PageServerLoad } from './$types';
import { MOCK_LEADS } from '$lib/server/mock';
import { LEAD_STAGES } from '$lib/zod/schemas';

// STUB: kanban columns by stage. Real impl supports drag-to-move + quick-assign + Won prompt.
export const load: PageServerLoad = async () => {
	const columns = LEAD_STAGES.map((stage) => ({
		stage,
		leads: MOCK_LEADS.filter((l) => l.stage === stage)
	}));
	return { columns };
};
