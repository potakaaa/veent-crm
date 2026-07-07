/**
 * Tests for the lead-assignment notification feature.
 *
 * - Case (a) is DB-free (pure message-format assertion) — always runs.
 * - Cases (b)-(e) are SKIP_DB-gated Hybrid tests hitting the real Drizzle query layer.
 *   Run locally: docker compose up -d db && bun run test:unit:ci
 *   Skipped automatically when DATABASE_URL is unset (no postgres service).
 *   Precondition: migration 0026 (crm_notifications) must be applied first.
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	leadAssignedMessage,
	getUnreadNotificationCount,
	listNotifications,
	markNotificationRead
} from '$lib/server/db/notifications';
import { createLead, claimLead, unclaimLead, reassignLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmNotifications } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;

// Seeded user UUIDs (scripts/seed.ts — must exist for the FKs to pass).
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const REP_UUID = '00000000-0000-0000-0000-000000000002';
const REP2_UUID = '00000000-0000-0000-0000-000000000003';
const TEST_PREFIX = '__inttest_notif__';

// Track created lead ids so cleanup removes them (crm_notifications rows cascade on lead delete).
const createdIds: string[] = [];

afterAll(async () => {
	if (SKIP_DB) return;
	for (const id of createdIds) {
		await db.delete(crmLeads).where(eq(crmLeads.id, id));
	}
});

// ---------------------------------------------------------------------------
// (a) DB-free — message format is exactly "<leadName> has been assigned to you"
// ---------------------------------------------------------------------------
describe('leadAssignedMessage (pure)', () => {
	it('formats the assignment message exactly', () => {
		expect(leadAssignedMessage('Acme Fest')).toBe('Acme Fest has been assigned to you');
	});
});

// ---------------------------------------------------------------------------
// (b) reassignLead creates exactly one lead_assigned row for the new owner
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('reassignLead → notification (DB)', () => {
	it('creates one lead_assigned notification for the new owner, null readAt', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Reassign Notify` }, REP_UUID);
		createdIds.push(lead.id);

		const reassigned = await reassignLead(lead.id, REP2_UUID, MANAGER_UUID);
		expect(reassigned).not.toBeNull();

		const rows = await db
			.select()
			.from(crmNotifications)
			.where(and(eq(crmNotifications.leadId, lead.id), eq(crmNotifications.userId, REP2_UUID)));

		expect(rows).toHaveLength(1);
		expect(rows[0].type).toBe('lead_assigned');
		expect(rows[0].readAt).toBeNull();
		expect(rows[0].message).toBe(`${TEST_PREFIX} Reassign Notify has been assigned to you`);
	});
});

// ---------------------------------------------------------------------------
// (c) claimLead / unclaimLead create ZERO notifications (AC4 structural proof)
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('self-claim paths create no notification (DB)', () => {
	it('claimLead and unclaimLead never insert a crm_notifications row', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Self Claim` }, REP_UUID);
		createdIds.push(lead.id);

		// Make it claimable (unowned), then claim + unclaim as the rep.
		await db.update(crmLeads).set({ ownerId: null }).where(eq(crmLeads.id, lead.id));
		const claimed = await claimLead(lead.id, REP_UUID);
		expect(claimed).not.toBeNull();
		const unclaimed = await unclaimLead(lead.id, REP_UUID);
		expect(unclaimed).not.toBeNull();

		const rows = await db
			.select()
			.from(crmNotifications)
			.where(eq(crmNotifications.leadId, lead.id));
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (d) markNotificationRead sets readAt; no-ops (null) for a mismatched userId
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('markNotificationRead authorization (DB)', () => {
	it('sets readAt for the owner and returns null for a non-owner', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Mark Read` }, REP_UUID);
		createdIds.push(lead.id);
		await reassignLead(lead.id, REP2_UUID, MANAGER_UUID);

		const [notif] = await db
			.select()
			.from(crmNotifications)
			.where(and(eq(crmNotifications.leadId, lead.id), eq(crmNotifications.userId, REP2_UUID)));
		expect(notif).toBeDefined();

		// Wrong owner → no-op, returns null, readAt stays null.
		const wrong = await markNotificationRead(notif.id, REP_UUID);
		expect(wrong).toBeNull();
		const [stillUnread] = await db
			.select()
			.from(crmNotifications)
			.where(eq(crmNotifications.id, notif.id));
		expect(stillUnread.readAt).toBeNull();

		// Correct owner → readAt set, returns the row.
		const ok = await markNotificationRead(notif.id, REP2_UUID);
		expect(ok).not.toBeNull();
		expect(ok!.readAt).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (e) getUnreadNotificationCount reflects read/unread state
// ---------------------------------------------------------------------------
describe.skipIf(SKIP_DB)('getUnreadNotificationCount (DB)', () => {
	it('decrements after a notification is marked read', async () => {
		const lead = await createLead({ name: `${TEST_PREFIX} Unread Count` }, REP_UUID);
		createdIds.push(lead.id);
		await reassignLead(lead.id, REP2_UUID, MANAGER_UUID);

		const before = await getUnreadNotificationCount(REP2_UUID);
		expect(before).toBeGreaterThanOrEqual(1);

		const list = await listNotifications(REP2_UUID);
		const mine = list.find((n) => n.leadId === lead.id);
		expect(mine).toBeDefined();
		expect(mine!.leadName).toBe(`${TEST_PREFIX} Unread Count`);

		await markNotificationRead(mine!.id, REP2_UUID);
		const after = await getUnreadNotificationCount(REP2_UUID);
		expect(after).toBe(before - 1);
	});
});
