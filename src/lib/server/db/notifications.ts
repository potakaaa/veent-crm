/**
 * Server-side DB access for in-app notifications (v1: manager lead-assignment only).
 * A single `read_at` column doubles as read AND dismissed state. All queries are
 * user-scoped — a notification may only be read or dismissed by its own `userId`.
 */
import { db } from './index';
import { crmNotifications, crmLeads } from './schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import type { Notification } from '$lib/types';

// Drizzle transaction handle — no existing alias to reuse (E2), so derive it locally
// from db.transaction's callback parameter so the insert helper composes inside an
// existing transaction rather than opening a second one.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Message shown for a manager lead-assignment notification. Pure — unit-testable. */
export function leadAssignedMessage(leadName: string): string {
	return `${leadName} has been assigned to you`;
}

/**
 * Insert a `lead_assigned` notification for `userId` inside an existing transaction.
 * Called from `reassignLead` so it shares the reassignment's all-or-nothing semantics.
 */
export async function createLeadAssignedNotification(
	tx: Tx,
	userId: string,
	leadId: string,
	leadName: string
): Promise<void> {
	await tx.insert(crmNotifications).values({
		userId,
		leadId,
		type: 'lead_assigned',
		message: leadAssignedMessage(leadName)
	});
}

/** Count of unread notifications for `userId` (drives the sidebar bell badge). */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`COUNT(*)` })
		.from(crmNotifications)
		.where(and(eq(crmNotifications.userId, userId), isNull(crmNotifications.readAt)));
	return Number(row?.count ?? 0);
}

/** All notifications for `userId`, newest first, capped at 200. */
export async function listNotifications(userId: string): Promise<Notification[]> {
	const rows = await db
		.select({
			id: crmNotifications.id,
			userId: crmNotifications.userId,
			leadId: crmNotifications.leadId,
			leadName: crmLeads.name,
			type: crmNotifications.type,
			message: crmNotifications.message,
			readAt: crmNotifications.readAt,
			createdAt: crmNotifications.createdAt
		})
		.from(crmNotifications)
		.leftJoin(crmLeads, eq(crmNotifications.leadId, crmLeads.id))
		.where(eq(crmNotifications.userId, userId))
		.orderBy(desc(crmNotifications.createdAt))
		.limit(200);

	return rows.map((r) => ({
		id: r.id,
		userId: r.userId,
		leadId: r.leadId,
		leadName: r.leadName ?? null,
		type: r.type,
		message: r.message,
		readAt: r.readAt?.toISOString() ?? null,
		createdAt: r.createdAt.toISOString()
	}));
}

/**
 * Mark a notification read/dismissed. Atomically ownership-scoped: the UPDATE only
 * matches when `id` AND `userId` both match, so a user can never read or dismiss
 * another user's notification. Returns `null` when no row matched (not found OR not
 * owned — the endpoint maps both to 404 to avoid leaking existence to a non-owner).
 */
export async function markNotificationRead(
	id: string,
	userId: string
): Promise<Notification | null> {
	const [row] = await db
		.update(crmNotifications)
		.set({ readAt: new Date() })
		.where(and(eq(crmNotifications.id, id), eq(crmNotifications.userId, userId)))
		.returning();

	if (!row) return null;

	return {
		id: row.id,
		userId: row.userId,
		leadId: row.leadId,
		leadName: null,
		type: row.type,
		message: row.message,
		readAt: row.readAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString()
	};
}
