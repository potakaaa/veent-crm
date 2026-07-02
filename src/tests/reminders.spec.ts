/**
 * Unit tests for the reminders feature (pure functions, no DB).
 *   VE-A1: resolveFollowUpAt computes follow-up from followUpInDays
 *   VE-B1: dbRowToLead urgency overdue / due
 *   VE-C2: sendReminderDigest no-ops when RESEND_API_KEY unset
 *   VE-R1: reminder grouping — overdue / cold / exclusions / sort order
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { resolveFollowUpAt, dbRowToLead } from '$lib/server/db/leads';
import { sendReminderDigest } from '$lib/server/email';
import { groupRemindersByRep, type DueReminder } from '$lib/server/reminders';
import { buildReminderDigestHtml } from '$lib/server/email-templates/reminder';
import type { Lead } from '$lib/types';

const DAY = 86_400_000;

function makeLeadRow(overrides: Partial<Parameters<typeof dbRowToLead>[0]> = {}) {
	const now = new Date();
	return {
		id: 'uuid-test-001',
		name: 'Test Org',
		category: 'Sports' as const,
		location: 'Manila',
		country: null,
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
		firstAnnouncedDate: null,
		firstReachedOutDate: null,
		sourceRef: null,
		scraperOrgId: null,
		stage: 'contacted' as const,
		lostReason: null,
		ownerId: 'owner-uuid',
		source: 'manual' as const,
		lastActivityAt: now,
		deletedAt: null,
		wonOrgName: null,
		dealValueCents: null,
		currency: 'PHP',
		signedAt: null,
		onboardingNotes: null,
		contractUrl: null,
		onboardingStartDate: null,
		goLiveDate: null,
		feeStructure: null,
		transactionFeePct: 7,
		convenienceFeePesos: 20,
		serviceFeePct: 3,
		serviceFeePerTicketPesos: 20,
		bankChargesAbsorbed: null,
		hasFutureEvents: false,
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
		await expect(sendReminderDigest({ repEmail: 'rep@example.com', reminders: [] })).resolves.toBe(
			'skipped'
		);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// VE-R1 — reminder grouping logic (pure, no DB)
// ---------------------------------------------------------------------------

describe('reminder grouping (VE-R1)', () => {
	// All dates relative to live Date.now() so dbRowToLead's default `now` lines up.
	function staleRow(daysAgo: number) {
		return makeLeadRow({
			id: `stale-${daysAgo}`,
			lastActivityAt: new Date(Date.now() - daysAgo * DAY)
		});
	}

	// — overdue ---

	it('overdue: lead with follow-up in the past appears as overdue', () => {
		const pastFollowUp = new Date(Date.now() - 3 * DAY);
		const lead = dbRowToLead(makeLeadRow(), pastFollowUp);
		expect(lead.urgency).toBe('overdue');
	});

	it('overdue: future follow-up does NOT appear as overdue', () => {
		const futureFollowUp = new Date(Date.now() + 5 * DAY);
		const lead = dbRowToLead(makeLeadRow(), futureFollowUp);
		expect(lead.urgency).not.toBe('overdue');
	});

	// — cold ---

	it('cold: contacted lead with last activity >30d and no follow-up is cold', () => {
		const row = staleRow(31);
		const lead = dbRowToLead(row);
		expect(lead.urgency).toBe('cold');
		expect(lead.age.type).toBe('stale');
	});

	it('cold: lead with last activity exactly 30d is NOT cold (threshold is >30d)', () => {
		const row = staleRow(30);
		const lead = dbRowToLead(row);
		expect(lead.urgency).not.toBe('cold');
	});

	// — exclusions ---

	it('won lead is excluded from both groups (urgency is normal)', () => {
		const row = makeLeadRow({ stage: 'won' as const });
		const lead = dbRowToLead(row);
		expect(lead.urgency).not.toBe('overdue');
		expect(lead.urgency).not.toBe('cold');
		expect(lead.age.label).toBe('won');
	});

	it('lost lead is excluded from both groups (urgency is normal)', () => {
		const row = makeLeadRow({ stage: 'lost' as const });
		const lead = dbRowToLead(row);
		expect(lead.urgency).not.toBe('overdue');
		expect(lead.urgency).not.toBe('cold');
		expect(lead.age.label).toBe('lost');
	});

	// — sort order ---

	it('overdue sort: earlier follow-up date sorts first (most overdue first)', () => {
		const earlier = dbRowToLead(makeLeadRow({ id: 'a' }), new Date(Date.now() - 5 * DAY));
		const later = dbRowToLead(makeLeadRow({ id: 'b' }), new Date(Date.now() - 2 * DAY));

		const sorted = [later, earlier].sort(
			(a: Lead, b: Lead) => new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime()
		);

		expect(sorted[0].id).toBe('a');
		expect(sorted[1].id).toBe('b');
	});

	it('cold sort: earlier lastActivityAt sorts first (coldest first)', () => {
		const colder = dbRowToLead(staleRow(60));
		const warmer = dbRowToLead(staleRow(35));

		const sorted = [warmer, colder].sort(
			(a: Lead, b: Lead) =>
				new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
		);

		expect(new Date(sorted[0].lastActivityAt) < new Date(sorted[1].lastActivityAt)).toBe(true);
	});

	// — determinism ---

	it('two overdue leads with identical followUpAt sort deterministically by id', () => {
		// Use a clearly past timestamp so both leads are definitively overdue.
		const ts = new Date(Date.now() - DAY);
		const a = dbRowToLead(makeLeadRow({ id: 'x' }), ts);
		const b = dbRowToLead(makeLeadRow({ id: 'y' }), ts);

		// Mirror the tiebreaker used in getRemindersQueue: primary followUpAt ASC, secondary id ASC.
		const sorted = [b, a].sort(
			(x: Lead, y: Lead) =>
				new Date(x.followUpAt!).getTime() - new Date(y.followUpAt!).getTime() ||
				x.id.localeCompare(y.id)
		);

		expect(sorted).toHaveLength(2);
		expect(sorted.every((l) => l.urgency === 'overdue')).toBe(true);
		// 'x' < 'y' alphabetically, so 'x' must come first
		expect(sorted[0].id).toBe('x');
		expect(sorted[1].id).toBe('y');
	});
});

// ---------------------------------------------------------------------------
// buildReminderDigestHtml — branded email template (pure)
// ---------------------------------------------------------------------------

function makeDueReminder(overrides: Partial<DueReminder> = {}): DueReminder {
	return {
		leadId: 'lead-uuid-001',
		leadName: 'Acme Sports Club',
		repEmail: 'rep@example.com',
		followUpAt: '2026-06-30T09:00:00.000Z',
		overdue: false,
		...overrides
	};
}

describe('buildReminderDigestHtml', () => {
	it('renders lead name and CTA with leadId', () => {
		const html = buildReminderDigestHtml({
			appUrl: 'https://crm.veent.io',
			reminders: [makeDueReminder({ leadId: 'lead-xyz', leadName: 'Acme Sports Club' })]
		});
		expect(html).toContain('Acme Sports Club');
		expect(html).toContain('https://crm.veent.io/leads/lead-xyz');
	});

	it('places overdue reminders in Overdue section', () => {
		const html = buildReminderDigestHtml({
			appUrl: 'https://crm.veent.io',
			reminders: [makeDueReminder({ overdue: true })]
		});
		expect(html).toContain('Overdue');
	});

	it('returns non-empty HTML for empty reminders list', () => {
		const html = buildReminderDigestHtml({ appUrl: '', reminders: [] });
		expect(html.length).toBeGreaterThan(0);
		expect(html).toContain('Veent');
	});
});

// ---------------------------------------------------------------------------
// groupRemindersByRep — pure grouping helper
// ---------------------------------------------------------------------------

describe('groupRemindersByRep', () => {
	it('groups by repEmail and drops null repEmail', () => {
		const reminders: DueReminder[] = [
			makeDueReminder({ leadId: 'a1', repEmail: 'rep-a@example.com' }),
			makeDueReminder({ leadId: 'b1', repEmail: 'rep-b@example.com' }),
			makeDueReminder({ leadId: 'a2', repEmail: 'rep-a@example.com' }),
			makeDueReminder({ leadId: 'n1', repEmail: null })
		];
		const groups = groupRemindersByRep(reminders);
		expect(groups).toHaveLength(2);
		const repA = groups.find((g) => g.repEmail === 'rep-a@example.com');
		const repB = groups.find((g) => g.repEmail === 'rep-b@example.com');
		expect(repA?.reminders).toHaveLength(2);
		expect(repB?.reminders).toHaveLength(1);
		expect(groups.some((g) => g.reminders.some((r) => r.repEmail === null))).toBe(false);
	});
});
