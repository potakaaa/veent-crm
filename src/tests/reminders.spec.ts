/**
 * Unit tests for the activity-log + reminders feature (pure functions, no DB).
 *   - VE-A1: resolveFollowUpAt computes follow-up from followUpInDays
 *   - VE-B1: dbRowToLead(row, followUpAt) urgency overdue / due
 *   - VE-C2: sendReminderDigest no-ops (logs, no throw) when RESEND_API_KEY unset
 */
import { describe, it, expect, vi } from 'vitest';

// Force the no-key contract path deterministically regardless of the ambient
// environment (RESEND_API_KEY may be set in CI/dev). db/index.ts falls back to a
// default DATABASE_URL when unset — no connection is opened by these pure tests.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { resolveFollowUpAt, dbRowToLead } from '$lib/server/db/leads';
import { sendReminderDigest } from '$lib/server/email';

const DAY = 86_400_000;

function makeLeadRow(overrides: Partial<Parameters<typeof dbRowToLead>[0]> = {}) {
	const now = new Date();
	return {
		id: 'uuid-test-001',
		name: 'Test Org',
		category: 'Sports' as const,
		location: 'Manila',
		platform: 'Facebook' as const,
		socialFacebook: null,
		socialInstagram: null,
		socialTiktok: null,
		socialTwitter: null,
		pageUrl: null,
		normalizedHandle: null,
		contactEmail: null,
		contactPhone: null,
		eventName: null,
		eventDate: null,
		eventDateRaw: null,
		eventLink: null,
		sourceRef: null,
		stage: 'contacted' as const,
		lostReason: null,
		ownerId: 'owner-uuid',
		source: 'manual' as const,
		needsReview: false,
		lastActivityAt: now,
		deletedAt: null,
		wonOrgName: null,
		dealValueCents: null,
		currency: 'PHP',
		signedAt: null,
		notes: null,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// VE-A1 — resolveFollowUpAt
// ---------------------------------------------------------------------------

describe('resolveFollowUpAt (VE-A1)', () => {
	it('computes followUpAt from followUpInDays', () => {
		const occurredAt = new Date('2026-06-24T00:00:00.000Z');
		const result = resolveFollowUpAt(occurredAt, 3);
		expect(result?.toISOString()).toBe(new Date(occurredAt.getTime() + 3 * DAY).toISOString());
	});

	it('prefers an explicit followUpAt over followUpInDays', () => {
		const occurredAt = new Date('2026-06-24T00:00:00.000Z');
		const explicit = new Date('2026-07-01T00:00:00.000Z');
		const result = resolveFollowUpAt(occurredAt, 3, explicit);
		expect(result?.toISOString()).toBe(explicit.toISOString());
	});

	it('returns null when neither followUpAt nor followUpInDays is provided', () => {
		const occurredAt = new Date('2026-06-24T00:00:00.000Z');
		expect(resolveFollowUpAt(occurredAt)).toBeNull();
	});

	it('ignores a non-finite followUpInDays', () => {
		const occurredAt = new Date('2026-06-24T00:00:00.000Z');
		expect(resolveFollowUpAt(occurredAt, Number.NaN)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// VE-B1 — dbRowToLead urgency from followUpAt
// ---------------------------------------------------------------------------

describe('dbRowToLead urgency (VE-B1)', () => {
	it("yields urgency 'overdue' for a past followUpAt", () => {
		const pastFollowUp = new Date(Date.now() - 10 * DAY);
		const lead = dbRowToLead(makeLeadRow(), pastFollowUp);
		expect(lead.age.type).toBe('overdue');
		expect(lead.urgency).toBe('overdue');
	});

	it("yields urgency 'due' for a followUpAt within today", () => {
		const dueFollowUp = new Date(Date.now() + 3_600_000); // +1h, same day
		const lead = dbRowToLead(makeLeadRow(), dueFollowUp);
		expect(lead.age.type).toBe('due');
		expect(lead.urgency).toBe('due');
	});

	it('accepts followUpAt as an ISO string', () => {
		const pastIso = new Date(Date.now() - 10 * DAY).toISOString();
		const lead = dbRowToLead(makeLeadRow(), pastIso);
		expect(lead.urgency).toBe('overdue');
	});
});

// ---------------------------------------------------------------------------
// VE-C2 — sendReminderDigest no-key no-op
// ---------------------------------------------------------------------------

describe('sendReminderDigest (VE-C2)', () => {
	it('no-ops (logs, does not throw) when RESEND_API_KEY is unset', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(
			sendReminderDigest({ repEmail: 'rep@example.com', reminders: [] })
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
