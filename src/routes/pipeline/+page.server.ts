import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listPipelineStage, listUsers } from '$lib/server/db/leads';
import { computeAppealScore, today } from '$lib/appeal-score';
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

	// Badge-only: attach derived Lead Appeal Score per card (never persisted). No sort UI —
	// per-column appeal sort is descoped (see process/features/leads/backlog/). `now` floored (E3).
	const now = today();
	const leads = stageResults
		.flatMap((r) => r.leads)
		.map((l) => ({
			...l,
			appealScore: computeAppealScore(l.eventDate, l.firstAnnouncedDate, l.firstReachedOutDate, now)
		}));
	const totalsPerStage = Object.fromEntries(
		BOARD_STAGES.map((stage, i) => [stage, stageResults[i].total])
	) as Record<Stage, number>;

	return { leads, totalsPerStage, users };
};
