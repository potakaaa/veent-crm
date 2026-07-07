/**
 * DB integration tests for logLeadTouch.
 *
 * Skipped when DATABASE_URL is not set (CI has no Postgres service for unit runs).
 * To run locally: ensure DATABASE_URL is in .env, then bun run test:unit:ci
 *
 *   T-D1: touch creates an activity row with correct fields
 *   T-D2: touch updates lead lastActivityAt
 *   T-D3: followUpAt is stored correctly for 1d / 3d / 7d / 14d
 *   T-D4: replied outcome auto-advances stage contacted → replied
 *   T-D5: logLeadTouch returns null for a non-existent lead
 *   T-D6: logTouch schema rejects invalid channel/outcome
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createLead, logLeadTouch } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmLeads, crmActivities } from '$lib/server/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { logTouchSchema } from '$lib/zod/schemas';
import { followUpDate } from '$lib/utils/dates';

const SKIP_DB = !process.env.DATABASE_URL;
const MANAGER_UUID = '00000000-0000-0000-0000-000000000001';
const PREFIX = '__touchtest__';

const createdLeadIds: string[] = [];

afterAll(async () => {
	if (createdLeadIds.length > 0) {
		await db.delete(crmLeads).where(inArray(crmLeads.id, createdLeadIds));
	}
});

async function makeTestLead(stage: 'new' | 'contacted' | 'replied' = 'contacted') {
	const lead = await createLead({ name: `${PREFIX} Lead ${Date.now()}` }, MANAGER_UUID);
	createdLeadIds.push(lead.id);
	if (stage !== 'new') {
		await db.update(crmLeads).set({ stage }).where(eq(crmLeads.id, lead.id));
	}
	return lead;
}

// ---------------------------------------------------------------------------
// T-D1 — activity row is created with correct fields
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('logLeadTouch — activity row (T-D1)', () => {
	it('inserts a crm_activities row with channel, outcome, and notes', async () => {
		const lead = await makeTestLead();

		await logLeadTouch(lead.id, {
			repId: MANAGER_UUID,
			channel: 'fb_dm',
			outcome: 'sent',
			notes: 'Sent intro message'
		});

		const rows = await db
			.select()
			.from(crmActivities)
			.where(eq(crmActivities.leadId, lead.id))
			.orderBy(desc(crmActivities.occurredAt))
			.limit(1);

		expect(rows).toHaveLength(1);
		expect(rows[0].channel).toBe('fb_dm');
		expect(rows[0].outcome).toBe('sent');
		expect(rows[0].notes).toBe('Sent intro message');
		expect(rows[0].repId).toBe(MANAGER_UUID);
	});
});

// ---------------------------------------------------------------------------
// T-D2 — lead lastActivityAt is updated
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('logLeadTouch — lastActivityAt (T-D2)', () => {
	it('bumps lead lastActivityAt after touch', async () => {
		const lead = await makeTestLead();
		const before = new Date(lead.lastActivityAt);

		// Ensure a measurable time gap.
		await new Promise((r) => setTimeout(r, 10));

		await logLeadTouch(lead.id, {
			repId: MANAGER_UUID,
			channel: 'email',
			outcome: 'sent'
		});

		const [updated] = await db
			.select({ lastActivityAt: crmLeads.lastActivityAt })
			.from(crmLeads)
			.where(eq(crmLeads.id, lead.id));

		expect(updated.lastActivityAt!.getTime()).toBeGreaterThan(before.getTime());
	});
});

// ---------------------------------------------------------------------------
// T-D3 — followUpAt is stored and matches followUpDate() computation
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('logLeadTouch — followUpAt (T-D3)', () => {
	for (const days of [1, 3, 7, 14]) {
		it(`followUpAt matches followUpDate(${days}) in Asia/Manila`, async () => {
			const lead = await makeTestLead();
			const now = new Date();
			const expectedDate = followUpDate(days, now); // YYYY-MM-DD Manila
			const followUpAt = new Date(expectedDate + 'T00:00:00+08:00');

			await logLeadTouch(lead.id, {
				repId: MANAGER_UUID,
				channel: 'fb_dm',
				outcome: 'sent',
				followUpAt
			});

			const rows = await db
				.select({ followUpAt: crmActivities.followUpAt })
				.from(crmActivities)
				.where(eq(crmActivities.leadId, lead.id))
				.orderBy(desc(crmActivities.occurredAt))
				.limit(1);

			expect(rows[0].followUpAt).toBeDefined();
			// Round-trip through Postgres: compare date portion in Manila timezone.
			const stored = rows[0].followUpAt!;
			const manilaOffset = 8 * 3_600_000;
			const storedManila = new Date(stored.getTime() + manilaOffset);
			const storedDate = storedManila.toISOString().slice(0, 10);
			expect(storedDate).toBe(expectedDate);
		});
	}
});

// ---------------------------------------------------------------------------
// T-D4 — replied outcome advances stage contacted → replied
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('logLeadTouch — stage auto-advance (T-D4)', () => {
	it('advances stage from contacted to replied when outcome is replied', async () => {
		const lead = await makeTestLead('contacted');

		const updated = await logLeadTouch(lead.id, {
			repId: MANAGER_UUID,
			channel: 'fb_dm',
			outcome: 'replied'
		});

		expect(updated).not.toBeNull();
		expect(updated!.stage).toBe('replied');

		const [row] = await db
			.select({ stage: crmLeads.stage })
			.from(crmLeads)
			.where(eq(crmLeads.id, lead.id));
		expect(row.stage).toBe('replied');
	});

	it('does not advance stage when outcome is sent', async () => {
		const lead = await makeTestLead('contacted');

		const updated = await logLeadTouch(lead.id, {
			repId: MANAGER_UUID,
			channel: 'fb_dm',
			outcome: 'sent'
		});

		expect(updated!.stage).toBe('contacted');
	});
});

// ---------------------------------------------------------------------------
// T-D5 — returns null for non-existent lead
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB)('logLeadTouch — missing lead (T-D5)', () => {
	it('returns null when lead id does not exist', async () => {
		const result = await logLeadTouch('00000000-0000-0000-0000-000000000000', {
			repId: MANAGER_UUID,
			channel: 'fb_dm',
			outcome: 'sent'
		});
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// T-D6 — logTouchSchema validation (pure, no DB)
// ---------------------------------------------------------------------------

describe('logTouchSchema validation (T-D6)', () => {
	it('accepts valid channel and outcome', () => {
		const result = logTouchSchema.safeParse({ channel: 'fb_dm', outcome: 'sent' });
		expect(result.success).toBe(true);
	});

	it('accepts all valid chip follow-up dates', () => {
		const now = new Date('2026-07-01T00:00:00.000Z');
		for (const days of [1, 3, 7, 14]) {
			const followUpAt = followUpDate(days, now);
			const result = logTouchSchema.safeParse({ channel: 'email', outcome: 'replied', followUpAt });
			expect(result.success).toBe(true);
		}
	});

	it('rejects an invalid channel', () => {
		const result = logTouchSchema.safeParse({ channel: 'smoke_signal', outcome: 'sent' });
		expect(result.success).toBe(false);
	});

	it('rejects an invalid outcome', () => {
		const result = logTouchSchema.safeParse({ channel: 'fb_dm', outcome: 'maybe' });
		expect(result.success).toBe(false);
	});

	it('rejects a malformed followUpAt (not YYYY-MM-DD)', () => {
		const result = logTouchSchema.safeParse({
			channel: 'fb_dm',
			outcome: 'sent',
			followUpAt: '2026-7-1'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a calendar-impossible date (2026-13-01, month 13)', () => {
		// V8 rolls over day overflow (e.g. Feb 31 → Mar 3) but rejects month overflow as Invalid Date.
		const result = logTouchSchema.safeParse({
			channel: 'fb_dm',
			outcome: 'sent',
			followUpAt: '2026-13-01'
		});
		expect(result.success).toBe(false);
	});

	it('defaults outcome to sent when omitted', () => {
		const result = logTouchSchema.safeParse({ channel: 'call' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.outcome).toBe('sent');
	});
});
