import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmActivities, crmUsers } from '$lib/server/db/schema';
import { eq, isNull, count, sum, and, sql } from 'drizzle-orm';
import type { ReportData, FunnelStage, Currency, HeatmapDay } from '$lib/types';
import { getLeadHeatmapData } from '$lib/server/db/leads';
import { currencyLabel } from '$lib/utils/currency';

const STAGE_META: Record<string, { label: string; color: string; order: number }> = {
	new: { label: 'New', color: '#6366f1', order: 0 },
	contacted: { label: 'Contacted', color: '#f59e0b', order: 1 },
	replied: { label: 'Replied', color: '#3b82f6', order: 2 },
	in_discussion: { label: 'In discussion', color: '#8b5cf6', order: 3 },
	won: { label: 'Won', color: '#22c55e', order: 4 },
	lost: { label: 'Lost', color: '#ef4444', order: 5 }
};

export const load: PageServerLoad = async ({ url }) => {
	const rawMetric = url.searchParams.get('heatMetric');
	const heatMetric: 'event_date' | 'created_at' =
		rawMetric === 'created_at' ? 'created_at' : 'event_date';
	// 1. Funnel counts
	const stageCounts = await db
		.select({ stage: crmLeads.stage, count: count() })
		.from(crmLeads)
		.where(isNull(crmLeads.deletedAt))
		.groupBy(crmLeads.stage);

	const total = stageCounts.reduce((s, r) => s + Number(r.count), 0);
	const wonRow = stageCounts.find((r) => r.stage === 'won');
	const newRow = stageCounts.find((r) => r.stage === 'new');
	const conversionRate =
		newRow && Number(newRow.count) > 0
			? Math.round((Number(wonRow?.count ?? 0) / Number(newRow.count)) * 100)
			: 0;

	const stageCountMap = Object.fromEntries(stageCounts.map((r) => [r.stage, Number(r.count)]));
	const funnel: FunnelStage[] = Object.entries(STAGE_META)
		.sort(([, a], [, b]) => a.order - b.order)
		.map(([stage, meta]) => {
			const c = stageCountMap[stage] ?? 0;
			return {
				stage: stage as FunnelStage['stage'],
				label: meta.label,
				color: meta.color,
				count: c,
				pct: total > 0 ? Math.round((c / total) * 100) : 0
			};
		});

	// 2. Leaderboard — touches + replies per rep
	const touchRows = await db
		.select({
			repId: crmActivities.repId,
			total: count(),
			replies: sql<number>`SUM(CASE WHEN ${crmActivities.outcome} = 'replied' THEN 1 ELSE 0 END)`
		})
		.from(crmActivities)
		.leftJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
		.where(isNull(crmLeads.deletedAt))
		.groupBy(crmActivities.repId);

	const winRows = await db
		.select({ ownerId: crmLeads.ownerId, wins: count() })
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
		.groupBy(crmLeads.ownerId);

	const users = await db
		.select({ id: crmUsers.id, name: crmUsers.name })
		.from(crmUsers)
		.where(eq(crmUsers.active, true));

	const winMap = Object.fromEntries(winRows.map((r) => [r.ownerId, Number(r.wins)]));
	const touchMap = Object.fromEntries(
		touchRows.map((r) => [r.repId, { total: Number(r.total), replies: Number(r.replies) }])
	);

	const leaderboard = users
		.map((u) => ({
			repId: u.id,
			name: u.name,
			touches: touchMap[u.id]?.total ?? 0,
			replies: touchMap[u.id]?.replies ?? 0,
			wins: winMap[u.id] ?? 0
		}))
		.sort((a, b) => b.wins - a.wins || b.touches - a.touches);

	// 3. Currency totals (NEVER sum across currencies)
	const currencyRows = await db
		.select({
			currency: crmLeads.currency,
			total: sum(crmLeads.dealValueCents),
			deals: count()
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
		.groupBy(crmLeads.currency);

	const currencyTotals = currencyRows
		.filter((r) => r.currency)
		.map((r) => ({
			currency: r.currency as Currency,
			label: currencyLabel(r.currency as Currency),
			total: Number(r.total) / 100,
			deals: Number(r.deals)
		}));

	const report: ReportData = { funnel, leaderboard, currencyTotals, conversionRate };

	// Heatmap
	const rawRows = await getLeadHeatmapData(heatMetric);
	const dayMap = new Map<string, HeatmapDay>();
	for (const row of rawRows) {
		if (!dayMap.has(row.date)) dayMap.set(row.date, { date: row.date, total: 0, stages: {} });
		const day = dayMap.get(row.date)!;
		day.total += row.count;
		day.stages[row.stage] = (day.stages[row.stage] ?? 0) + row.count;
	}

	return { report, heatmap: [...dayMap.values()], heatMetric };
};
