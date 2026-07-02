import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPipelineStage } from '$lib/server/db/leads';
import { computeAppealScore, today } from '$lib/appeal-score';
import type { Stage } from '$lib/types';

const BOARD_STAGES = ['new', 'contacted', 'replied', 'in_discussion', 'won'] as const;
type BoardStage = (typeof BOARD_STAGES)[number];

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const stage = url.searchParams.get('stage') ?? '';
	if (!(BOARD_STAGES as readonly string[]).includes(stage)) {
		throw error(400, 'Invalid stage');
	}
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const limit = Math.min(
		50,
		Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10) || 10)
	);
	const result = await listPipelineStage(
		stage as BoardStage as Stage,
		page,
		limit,
		locals.user.id,
		locals.user.role
	);
	// Badge-only: attach derived Lead Appeal Score per card (never persisted), matching the
	// pipeline loader so lazy-loaded cards score identically to the initial server load.
	const now = today();
	const leads = result.leads.map((l) => ({
		...l,
		appealScore: computeAppealScore(l.eventDate, l.firstAnnouncedDate, l.firstReachedOutDate, now)
	}));
	return json({ ...result, leads });
};
