import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	listPipelineStage,
	listUsers,
	listActiveReps,
	resolvePipelineRepFilter
} from '$lib/server/db/leads';
import { computeAppealScore, today } from '$lib/appeal-score';
import type { Stage } from '$lib/types';
import { BOARD_STAGES } from '$lib/utils/stages';

const PAGE_LIMIT = 10;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Read `q` for the SSR initial value / direct-link / refresh. When non-empty, the initial
	// load fetches the full server-side match set per stage (bumped limit) so a direct-link /
	// refresh with `?q=` renders every match, not just the client-filtered first page.
	const initialQuery = url.searchParams.get('q') ?? '';
	const trimmedQuery = initialQuery.trim();
	const searchActive = trimmedQuery.length > 0;
	const SEARCH_LIMIT = 50;

	// Manager-only AE filter (`?rep=<uuid>`). Reps never filter — the param is read only for
	// managers/super_managers AND re-guarded inside buildPipelineStageWhereClause (trust boundary).
	const isManager = locals.user.role === 'manager' || locals.user.role === 'super_manager';
	const filterRepId = resolvePipelineRepFilter(
		locals.user.role,
		isManager ? url.searchParams.get('rep') : null
	);

	const [stageResults, users, activeReps] = await Promise.all([
		Promise.all(
			BOARD_STAGES.map((stage) =>
				listPipelineStage(
					stage,
					1,
					searchActive ? SEARCH_LIMIT : PAGE_LIMIT,
					locals.user!.id,
					locals.user!.role,
					filterRepId,
					searchActive ? trimmedQuery : undefined
				)
			)
		),
		listUsers(),
		isManager ? listActiveReps() : Promise.resolve([])
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

	return {
		leads,
		totalsPerStage,
		users,
		initialQuery,
		activeReps,
		filterRepId: filterRepId ?? null,
		isManager
	};
};
