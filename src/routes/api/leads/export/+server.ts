import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { listLeadsFiltered } from '$lib/server/db/leads';
import { leadsToCsv } from '$lib/utils/csv';
import type { LeadSegment } from '$lib/types';

const VALID_SEGMENTS = new Set(['mine', 'all', 'unassigned', 'lost']);

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawSegment = url.searchParams.get('segment') ?? 'mine';
	const segment: LeadSegment = VALID_SEGMENTS.has(rawSegment)
		? (rawSegment as LeadSegment)
		: 'mine';
	const stage = url.searchParams.get('stage') ?? '';
	const platform = url.searchParams.get('platform') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const staleOnly = url.searchParams.get('staleOnly') === '1';
	const search = url.searchParams.get('q') ?? '';

	const { leads } = await listLeadsFiltered({
		userId: locals.user.id,
		segment,
		stage: stage || undefined,
		platform: platform || undefined,
		country: country || undefined,
		staleOnly,
		search: search || undefined,
		page: 1,
		pageSize: 10_000 // effectively unlimited for export
	});

	const csv = leadsToCsv(leads);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="veent-leads.csv"'
		}
	});
};
