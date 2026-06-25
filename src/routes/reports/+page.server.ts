import type { PageServerLoad } from './$types';
import { MOCK_FUNNEL, MOCK_LEADERBOARD } from '$lib/server/mock';

// STUB: ECharts funnel + per-rep leaderboard (wins · touches · replies). Real impl aggregates
// from Drizzle; deal value shown per-currency, never summed across currencies.
export const load: PageServerLoad = async () => {
	return { funnel: MOCK_FUNNEL, leaderboard: MOCK_LEADERBOARD };
};
