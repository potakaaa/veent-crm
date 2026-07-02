import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { listLeadsFiltered } from '$lib/server/db/leads';
import { leadsToCsv } from '$lib/utils/csv';
import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
import type { LeadSegment } from '$lib/types';

const VALID_SEGMENTS = new Set(['mine', 'all', 'unassigned', 'lost']);
const VALID_STAGES = new Set<string>(LEAD_STAGES);
const VALID_PLATFORMS = new Set<string>(LEAD_PLATFORMS);

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawSegment = url.searchParams.get('segment') ?? 'mine';
	const segment: LeadSegment = VALID_SEGMENTS.has(rawSegment)
		? (rawSegment as LeadSegment)
		: 'mine';
	const rawStage = url.searchParams.get('stage') ?? '';
	const stage = VALID_STAGES.has(rawStage) ? rawStage : '';
	const rawPlatform = url.searchParams.get('platform') ?? '';
	const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : '';
	const country = url.searchParams.get('country') ?? '';
	const staleOnly = url.searchParams.get('staleOnly') === '1';
	const search = url.searchParams.get('q') ?? '';

	const filterArgs = {
		userId: locals.user.id,
		role: locals.user.role,
		segment,
		stage: stage || undefined,
		platform: platform || undefined,
		country: country || undefined,
		staleOnly,
		search: search || undefined
	};

	// Two-query approach: get total first, then fetch all rows without a hard cap.
	const { total } = await listLeadsFiltered({ ...filterArgs, page: 1, pageSize: 1 });
	const { leads } =
		total > 0
			? await listLeadsFiltered({ ...filterArgs, page: 1, pageSize: total })
			: { leads: [] };

	const csv = leadsToCsv(leads);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="veent-leads.csv"',
			'Cache-Control': 'no-store'
		}
	});
};
