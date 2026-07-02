import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listPipelineStage, listUsers } from '$lib/server/db/leads';
import type { Stage } from '$lib/types';

const BOARD_STAGES: Stage[] = ['new', 'contacted', 'replied', 'in_discussion', 'won'];
const PAGE_LIMIT = 10;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [stageResults, users] = await Promise.all([
		Promise.all(
			BOARD_STAGES.map((stage) =>
				listPipelineStage(stage, 1, PAGE_LIMIT, locals.user!.id, locals.user!.role)
			)
		),
		listUsers()
	]);

	const leads = stageResults.flatMap((r) => r.leads);
	const totalsPerStage = Object.fromEntries(
		BOARD_STAGES.map((stage, i) => [stage, stageResults[i].total])
	) as Record<Stage, number>;

	return { leads, totalsPerStage, users };
};
