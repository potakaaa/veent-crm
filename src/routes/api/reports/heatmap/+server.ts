import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLeadHeatmapData } from '$lib/server/db/leads';
import type { HeatmapDay } from '$lib/types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawMetric = url.searchParams.get('metric');
	const metric: 'event_date' | 'created_at' =
		rawMetric === 'created_at' ? 'created_at' : 'event_date';

	const rawRows = await getLeadHeatmapData(metric);
	const dayMap = new Map<string, HeatmapDay>();
	for (const row of rawRows) {
		if (!dayMap.has(row.date)) dayMap.set(row.date, { date: row.date, total: 0, stages: {} });
		const day = dayMap.get(row.date)!;
		day.total += row.count;
		day.stages[row.stage] = (day.stages[row.stage] ?? 0) + row.count;
	}

	return json([...dayMap.values()]);
};
