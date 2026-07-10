import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmUsers, crmActivities, crmMeetings } from '$lib/server/db/schema';
import { eq, isNull, isNotNull, and, count, gte, lte, sql, inArray } from 'drizzle-orm';
import { formatFullName } from '$lib/utils/format-name';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeCell(raw: unknown): string {
	const s = String(raw ?? '');
	// Neutralize spreadsheet formula injection (=, +, -, @, tab, CR as first char)
	return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function makeCsv(headers: string[], rows: Record<string, unknown>[]): string {
	const csvRows = [
		headers.join(','),
		...rows.map((r) => headers.map((h) => `"${sanitizeCell(r[h]).replace(/"/g, '""')}"`).join(','))
	];
	// UTF-8 BOM for Excel
	return '﻿' + csvRows.join('\r\n');
}

export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type');
	if (type !== 'rep-performance' && type !== 'outreach-detail') {
		return new Response('Invalid export type. Use ?type=rep-performance or ?type=outreach-detail', {
			status: 400
		});
	}

	const rawFrom = url.searchParams.get('from');
	const rawTo = url.searchParams.get('to');
	const repId = url.searchParams.get('repId') || undefined;
	const from = rawFrom && ISO_DATE.test(rawFrom) ? rawFrom : undefined;
	const to = rawTo && ISO_DATE.test(rawTo) ? rawTo : undefined;
	const dateSuffix =
		from && to ? `${from}_${to}` : from ? `from-${from}` : to ? `to-${to}` : 'all-time';

	if (type === 'rep-performance') {
		// All active reps (optionally filtered to one)
		const userConds = [];
		if (repId) userConds.push(eq(crmUsers.id, repId));
		const userRows = await db
			.select({ id: crmUsers.id, firstName: crmUsers.firstName, lastName: crmUsers.lastName })
			.from(crmUsers)
			.where(userConds.length ? and(...userConds) : undefined)
			.orderBy(crmUsers.firstName);
		const users = userRows.map((u) => ({
			id: u.id,
			name: formatFullName(u.firstName, u.lastName)
		}));

		// Touches + replies per rep in date range
		const touchConds = [isNull(crmLeads.deletedAt)];
		if (from) touchConds.push(sql`${crmActivities.occurredAt} >= ${from}::date`);
		if (to) touchConds.push(sql`${crmActivities.occurredAt} < (${to}::date + interval '1 day')`);
		if (repId) touchConds.push(eq(crmActivities.repId, repId));

		const touchRows = await db
			.select({
				repId: crmActivities.repId,
				touches: count(),
				replies: sql<number>`SUM(CASE WHEN ${crmActivities.outcome} = 'replied' THEN 1 ELSE 0 END)`
			})
			.from(crmActivities)
			.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
			.where(and(...touchConds))
			.groupBy(crmActivities.repId);

		// Wins per rep filtered by signedAt
		const winConds = [isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')];
		if (from) winConds.push(sql`${crmLeads.signedAt} >= ${from}::date`);
		if (to) winConds.push(sql`${crmLeads.signedAt} < (${to}::date + interval '1 day')`);
		if (repId) winConds.push(eq(crmLeads.ownerId, repId));

		const winRows = await db
			.select({ ownerId: crmLeads.ownerId, wins: count() })
			.from(crmLeads)
			.where(and(...winConds))
			.groupBy(crmLeads.ownerId);

		// Leads reached out per rep in date range
		const reachedConds = [isNull(crmLeads.deletedAt), isNotNull(crmLeads.firstReachedOutDate)];
		if (from) reachedConds.push(gte(crmLeads.firstReachedOutDate, from));
		if (to) reachedConds.push(lte(crmLeads.firstReachedOutDate, to));
		if (repId) reachedConds.push(eq(crmLeads.ownerId, repId));

		const reachedRows = await db
			.select({ ownerId: crmLeads.ownerId, n: count() })
			.from(crmLeads)
			.where(and(...reachedConds))
			.groupBy(crmLeads.ownerId);

		// Meetings organised per rep in date range
		const meetingConds = [isNull(crmMeetings.deletedAt)];
		if (from) meetingConds.push(sql`${crmMeetings.startAt} >= ${from}::date`);
		if (to) meetingConds.push(sql`${crmMeetings.startAt} < (${to}::date + interval '1 day')`);
		if (repId) meetingConds.push(eq(crmMeetings.organizerId, repId));

		const meetingRows = await db
			.select({ organizerId: crmMeetings.organizerId, n: count() })
			.from(crmMeetings)
			.where(and(...meetingConds))
			.groupBy(crmMeetings.organizerId);

		const touchMap = Object.fromEntries(
			touchRows.map((r) => [r.repId, { touches: Number(r.touches), replies: Number(r.replies) }])
		);
		const winMap = Object.fromEntries(winRows.map((r) => [r.ownerId, Number(r.wins)]));
		const reachedMap = Object.fromEntries(reachedRows.map((r) => [r.ownerId, Number(r.n)]));
		const meetingMap = Object.fromEntries(meetingRows.map((r) => [r.organizerId, Number(r.n)]));

		const HEADERS = ['Rep', 'Touches', 'Replies', 'Wins', 'Leads Reached Out', 'Meetings'];
		const rows = users
			.map((u) => ({
				Rep: u.name,
				Touches: touchMap[u.id]?.touches ?? 0,
				Replies: touchMap[u.id]?.replies ?? 0,
				Wins: winMap[u.id] ?? 0,
				'Leads Reached Out': reachedMap[u.id] ?? 0,
				Meetings: meetingMap[u.id] ?? 0
			}))
			.sort((a, b) => b.Touches - a.Touches);

		return new Response(makeCsv(HEADERS, rows), {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="veent-rep-performance-${dateSuffix}.csv"`
			}
		});
	}

	// outreach-detail: one row per lead with activity (touches, meetings, or first reach-out) in range
	const touchConds = [isNull(crmLeads.deletedAt)];
	if (from) touchConds.push(sql`${crmActivities.occurredAt} >= ${from}::date`);
	if (to) touchConds.push(sql`${crmActivities.occurredAt} < (${to}::date + interval '1 day')`);
	if (repId) touchConds.push(eq(crmLeads.ownerId, repId));

	const touchRows = await db
		.select({
			leadId: crmActivities.leadId,
			touches: count(),
			replied: sql<number>`MAX(CASE WHEN ${crmActivities.outcome} = 'replied' THEN 1 ELSE 0 END)`
		})
		.from(crmActivities)
		.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
		.where(and(...touchConds))
		.groupBy(crmActivities.leadId);

	// Meeting flag per lead in range
	const meetingConds = [isNull(crmMeetings.deletedAt), isNull(crmLeads.deletedAt)];
	if (from) meetingConds.push(sql`${crmMeetings.startAt} >= ${from}::date`);
	if (to) meetingConds.push(sql`${crmMeetings.startAt} < (${to}::date + interval '1 day')`);
	if (repId) meetingConds.push(eq(crmLeads.ownerId, repId));

	const meetingLeadRows = await db
		.selectDistinct({ leadId: crmMeetings.leadId })
		.from(crmMeetings)
		.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
		.where(and(...meetingConds));

	// Leads first-reached-out in range
	const reachedConds = [isNull(crmLeads.deletedAt), isNotNull(crmLeads.firstReachedOutDate)];
	if (from) reachedConds.push(gte(crmLeads.firstReachedOutDate, from));
	if (to) reachedConds.push(lte(crmLeads.firstReachedOutDate, to));
	if (repId) reachedConds.push(eq(crmLeads.ownerId, repId));

	const reachedLeads = await db
		.select({ id: crmLeads.id })
		.from(crmLeads)
		.where(and(...reachedConds));

	const leadIds = [
		...new Set([
			...touchRows.map((r) => r.leadId),
			// Standalone meetings have a null leadId; drop them — the lead report is lead-scoped.
			...meetingLeadRows.map((r) => r.leadId).filter((id): id is string => id !== null),
			...reachedLeads.map((r) => r.id)
		])
	];

	const HEADERS = [
		'Lead',
		'Stage',
		'Rep',
		'First Reached Out',
		'Touches',
		'Replied',
		'Meeting Logged'
	];

	if (leadIds.length === 0) {
		return new Response(makeCsv(HEADERS, []), {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="veent-outreach-detail-${dateSuffix}.csv"`
			}
		});
	}

	const leads = await db
		.select({
			id: crmLeads.id,
			name: crmLeads.name,
			stage: crmLeads.stage,
			ownerId: crmLeads.ownerId,
			firstReachedOutDate: crmLeads.firstReachedOutDate
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), inArray(crmLeads.id, leadIds)));

	const userRows = await db
		.select({ id: crmUsers.id, firstName: crmUsers.firstName, lastName: crmUsers.lastName })
		.from(crmUsers);

	const userMap = Object.fromEntries(
		userRows.map((u) => [u.id, formatFullName(u.firstName, u.lastName)])
	);
	const touchMap = Object.fromEntries(
		touchRows.map((r) => [r.leadId, { touches: Number(r.touches), replied: Number(r.replied) > 0 }])
	);
	const meetingSet = new Set(meetingLeadRows.map((r) => r.leadId));
	const leadIdSet = new Set(leadIds);

	const STAGE_LABELS: Record<string, string> = {
		new: 'New',
		contacted: 'Contacted',
		replied: 'Replied',
		in_discussion: 'In Discussion',
		won: 'Won',
		lost: 'Lost'
	};

	const rows = leads
		.filter((l) => leadIdSet.has(l.id))
		.map((l) => ({
			Lead: l.name,
			Stage: STAGE_LABELS[l.stage] ?? l.stage,
			Rep: l.ownerId ? (userMap[l.ownerId] ?? '') : '',
			'First Reached Out': l.firstReachedOutDate ?? '',
			Touches: touchMap[l.id]?.touches ?? 0,
			Replied: touchMap[l.id]?.replied ? 'Y' : 'N',
			'Meeting Logged': meetingSet.has(l.id) ? 'Y' : 'N'
		}))
		.sort(
			(a, b) =>
				String(a.Rep).localeCompare(String(b.Rep)) || String(a.Lead).localeCompare(String(b.Lead))
		);

	return new Response(makeCsv(HEADERS, rows), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="veent-outreach-detail-${dateSuffix}.csv"`
		}
	});
};
