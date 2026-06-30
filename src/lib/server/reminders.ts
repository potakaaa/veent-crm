// Reminders — real impl. See sales-crm.md §Reminders.
// follow_up_at drives the in-app "Today" due view; due/overdue computed in Asia/Manila.
// An n8n workflow calls the secret-authed /api/reminders/due endpoint (n8n holds no DATABASE_URL).

import { db } from './db/index';
import { crmActivities, crmLeads, crmUsers } from './db/schema';
import { and, asc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';

export const REMINDER_TZ = 'Asia/Manila';

export type DueReminder = {
	leadId: string;
	leadName: string;
	repEmail: string | null;
	followUpAt: string; // ISO
	overdue: boolean;
};

/**
 * Start of "today" in Asia/Manila (UTC+8, fixed offset), returned as a UTC Date.
 * Used as the boundary for the overdue (before today) vs due (today) distinction.
 */
export function startOfManilaDayUTC(): Date {
	const now = new Date();
	const manilaDateStr = now.toLocaleDateString('en-CA', { timeZone: REMINDER_TZ }); // 'YYYY-MM-DD'
	return new Date(`${manilaDateStr}T00:00:00+08:00`);
}

/**
 * All activities whose follow-up is due (<= now), joined to their lead + rep,
 * sorted ascending by follow-up time. `overdue` = before today's Manila start-of-day.
 */
export async function getDueReminders(): Promise<DueReminder[]> {
	const startOfToday = startOfManilaDayUTC();

	const rows = await db
		.select({
			leadId: crmLeads.id,
			leadName: crmLeads.name,
			repEmail: crmUsers.email,
			followUpAt: crmActivities.followUpAt
		})
		.from(crmActivities)
		.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
		.leftJoin(crmUsers, eq(crmActivities.repId, crmUsers.id))
		.where(
			and(
				isNotNull(crmActivities.followUpAt),
				lte(crmActivities.followUpAt, new Date()),
				isNull(crmLeads.deletedAt),
				or(isNull(crmUsers.id), eq(crmUsers.active, true))
			)
		)
		.orderBy(asc(crmActivities.followUpAt));

	return rows.map((r) => ({
		leadId: r.leadId,
		leadName: r.leadName,
		repEmail: r.repEmail,
		followUpAt: r.followUpAt!.toISOString(),
		overdue: r.followUpAt! < startOfToday
	}));
}

/**
 * Group due reminders by rep email, preserving input order within each group.
 * Reminders with a null repEmail are DROPPED (they are the "skipped" count).
 * Pure, deterministic — no DB, no env.
 */
export function groupRemindersByRep(
	reminders: DueReminder[]
): Array<{ repEmail: string; reminders: DueReminder[] }> {
	const order: string[] = [];
	const byRep = new Map<string, DueReminder[]>();

	for (const r of reminders) {
		if (r.repEmail === null) continue;
		let group = byRep.get(r.repEmail);
		if (!group) {
			group = [];
			byRep.set(r.repEmail, group);
			order.push(r.repEmail);
		}
		group.push(r);
	}

	return order.map((repEmail) => ({ repEmail, reminders: byRep.get(repEmail)! }));
}
