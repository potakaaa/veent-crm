import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmActivities, crmUsers, crmMeetings } from '$lib/server/db/schema';
import { eq, isNull, isNotNull, gte, lte, count, sum, and, sql } from 'drizzle-orm';
import type { ReportData, FunnelStage, Currency, HeatmapDay, OutreachMetrics } from '$lib/types';
import { getLeadHeatmapData } from '$lib/server/db/leads';
import { currencyLabel } from '$lib/utils/currency';

const STAGE_META: Record<string, { label: string; color: string; order: number }> = {
	new: { label: 'New', color: '#6366f1', order: 0 },
	contacted: { label: 'Contacted', color: '#f59e0b', order: 1 },
	replied: { label: 'Replied', color: '#3b82f6', order: 2 },
	in_discussion: { label: 'In discussion', color: '#8b5cf6', order: 3 },
	won: { label: 'Won', color: '#22c55e', order: 4 },
	live: { label: 'Live', color: '#16a34a', order: 5 },
	lost: { label: 'Lost', color: '#ef4444', order: 6 }
};

async function fetchReport(): Promise<ReportData> {
	const [stageCounts, touchRows, winRows, users, currencyRows] = await Promise.all([
		db
			.select({ stage: crmLeads.stage, count: count() })
			.from(crmLeads)
			.where(isNull(crmLeads.deletedAt))
			.groupBy(crmLeads.stage),
		db
			.select({
				repId: crmActivities.repId,
				total: count(),
				replies: sql<number>`SUM(CASE WHEN ${crmActivities.outcome} = 'replied' THEN 1 ELSE 0 END)`
			})
			.from(crmActivities)
			.leftJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
			.where(isNull(crmLeads.deletedAt))
			.groupBy(crmActivities.repId),
		db
			.select({ ownerId: crmLeads.ownerId, wins: count() })
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
			.groupBy(crmLeads.ownerId),
		db
			.select({ id: crmUsers.id, name: crmUsers.name })
			.from(crmUsers)
			.where(eq(crmUsers.active, true)),
		db
			.select({
				currency: crmLeads.currency,
				total: sum(crmLeads.dealValueCents),
				deals: count()
			})
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
			.groupBy(crmLeads.currency)
	]);

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
		.sort((a, b) => b.touches - a.touches || b.wins - a.wins);

	const currencyTotals = currencyRows
		.filter((r) => r.currency)
		.map((r) => ({
			currency: r.currency as Currency,
			label: currencyLabel(r.currency as Currency),
			total: Number(r.total) / 100,
			deals: Number(r.deals)
		}));

	return { funnel, leaderboard, currencyTotals, conversionRate };
}

async function fetchOutreach(filters: {
	from?: string;
	to?: string;
	repId?: string;
}): Promise<OutreachMetrics> {
	const { from, to, repId } = filters;

	// 1. Leads reached out: firstReachedOutDate is set
	const reachedConds = [isNull(crmLeads.deletedAt), isNotNull(crmLeads.firstReachedOutDate)];
	if (from) reachedConds.push(gte(crmLeads.firstReachedOutDate, from));
	if (to) reachedConds.push(lte(crmLeads.firstReachedOutDate, to));
	if (repId) reachedConds.push(eq(crmLeads.ownerId, repId));

	// 2. Leads that replied: distinct leads with at least one outcome='replied' activity
	const repliedConds = [isNull(crmLeads.deletedAt), eq(crmActivities.outcome, 'replied')];
	if (from) repliedConds.push(sql`${crmActivities.occurredAt} >= ${from}::date`);
	if (to) repliedConds.push(sql`${crmActivities.occurredAt} < (${to}::date + interval '1 day')`);
	if (repId) repliedConds.push(eq(crmActivities.repId, repId));

	// 3. Leads with at least one meeting logged
	const meetingConds = [isNull(crmMeetings.deletedAt), isNull(crmLeads.deletedAt)];
	if (from) meetingConds.push(sql`${crmMeetings.startAt} >= ${from}::date`);
	if (to) meetingConds.push(sql`${crmMeetings.startAt} < (${to}::date + interval '1 day')`);
	if (repId) meetingConds.push(eq(crmMeetings.organizerId, repId));

	const [reachedRow, repliedRow, meetingRow] = await Promise.all([
		db
			.select({ n: count() })
			.from(crmLeads)
			.where(and(...reachedConds)),
		db
			.select({ n: sql<number>`COUNT(DISTINCT ${crmActivities.leadId})` })
			.from(crmActivities)
			.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
			.where(and(...repliedConds)),
		db
			.select({ n: sql<number>`COUNT(DISTINCT ${crmMeetings.leadId})` })
			.from(crmMeetings)
			.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
			.where(and(...meetingConds))
	]);

	return {
		leadsReachedOut: Number(reachedRow[0]?.n ?? 0),
		leadsThatReplied: Number(repliedRow[0]?.n ?? 0),
		leadsWithMeeting: Number(meetingRow[0]?.n ?? 0)
	};
}

async function fetchHeatmap(metric: 'event_date' | 'created_at'): Promise<HeatmapDay[]> {
	const rawRows = await getLeadHeatmapData(metric);
	const dayMap = new Map<string, HeatmapDay>();
	for (const row of rawRows) {
		if (!dayMap.has(row.date)) dayMap.set(row.date, { date: row.date, total: 0, stages: {} });
		const day = dayMap.get(row.date)!;
		day.total += row.count;
		day.stages[row.stage] = (day.stages[row.stage] ?? 0) + row.count;
	}
	return [...dayMap.values()];
}

export const load: PageServerLoad = async ({ url }) => {
	const rawMetric = url.searchParams.get('heatMetric');
	const heatMetric: 'event_date' | 'created_at' =
		rawMetric === 'created_at' ? 'created_at' : 'event_date';

	const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
	const rawFrom = url.searchParams.get('from');
	const rawTo = url.searchParams.get('to');
	const from = rawFrom && ISO_DATE.test(rawFrom) ? rawFrom : undefined;
	const to = rawTo && ISO_DATE.test(rawTo) ? rawTo : undefined;
	const repId = url.searchParams.get('repId') || undefined;

	const users = await db
		.select({ id: crmUsers.id, name: crmUsers.name })
		.from(crmUsers)
		.where(eq(crmUsers.active, true))
		.orderBy(crmUsers.name);

	return {
		heatMetric,
		from: from ?? null,
		to: to ?? null,
		repId: repId ?? null,
		users,
		report: fetchReport(),
		outreach: fetchOutreach({ from, to, repId }),
		heatmap: fetchHeatmap(heatMetric)
	};
};
