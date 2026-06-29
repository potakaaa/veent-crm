import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmUsers } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

const WON_HEADERS = ['Lead Name', 'Org (Won)', 'Deal Value', 'Currency', 'Signed At', 'Rep', 'Category'] as const;
const VIEW_HEADERS = ['Name', 'Category', 'Platform', 'Stage', 'Location', 'Page URL', 'Source', 'Created At'] as const;

export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type');
	if (type !== 'won' && type !== 'view') {
		return new Response('Invalid export type. Use ?type=won or ?type=view', { status: 400 });
	}

	let rows: Record<string, unknown>[];

	if (type === 'won') {
		// Won-deals export for finance
		const data = await db
			.select({
				name: crmLeads.name,
				wonOrgName: crmLeads.wonOrgName,
				dealValueCents: crmLeads.dealValueCents,
				currency: crmLeads.currency,
				signedAt: crmLeads.signedAt,
				ownerId: crmLeads.ownerId,
				category: crmLeads.category
			})
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')));

		// Resolve owner names
		const users = await db.select({ id: crmUsers.id, name: crmUsers.name }).from(crmUsers);
		const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

		rows = data
			.sort((a, b) => (b.signedAt?.getTime() ?? 0) - (a.signedAt?.getTime() ?? 0))
			.map((r) => ({
				'Lead Name': r.name,
				'Org (Won)': r.wonOrgName ?? '',
				'Deal Value': r.dealValueCents != null ? r.dealValueCents / 100 : '',
				Currency: r.currency ?? '',
				'Signed At': r.signedAt ? r.signedAt.toISOString().split('T')[0] : '',
				Rep: r.ownerId ? (userMap[r.ownerId] ?? '') : '',
				Category: r.category
			}));
	} else {
		// View export — all active leads
		const data = await db
			.select({
				id: crmLeads.id,
				name: crmLeads.name,
				category: crmLeads.category,
				platform: crmLeads.platform,
				stage: crmLeads.stage,
				location: crmLeads.location,
				pageUrl: crmLeads.pageUrl,
				source: crmLeads.source,
				createdAt: crmLeads.createdAt
			})
			.from(crmLeads)
			.where(isNull(crmLeads.deletedAt));

		rows = data.map((r) => ({
			Name: r.name,
			Category: r.category,
			Platform: r.platform ?? '',
			Stage: r.stage,
			Location: r.location ?? '',
			'Page URL': r.pageUrl ?? '',
			Source: r.source,
			'Created At': r.createdAt.toISOString().split('T')[0]
		}));
	}

	const headers: readonly string[] = type === 'won' ? WON_HEADERS : VIEW_HEADERS;
	const csvRows = [
		headers.join(','),
		...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
	];
	// UTF-8 BOM for Excel
	const csv = '﻿' + csvRows.join('\r\n');

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="veent-${type}-${new Date().toISOString().split('T')[0]}.csv"`
		}
	});
};
