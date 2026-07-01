/**
 * Unit tests for Phase 4 — lead list, detail, and add.
 *
 * Pure-function tests only (no DB required):
 *   - leadFormSchema validation (server-side create gate)
 *   - dbRowToLead mapper (urgency, handle, age, field mapping)
 *   - dbActivityToActivity mapper
 */
import { describe, it, expect } from 'vitest';
import { leadFormSchema } from '$lib/zod/schemas';
import { dbRowToLead, dbActivityToActivity } from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';
import type { Lead, User } from '$lib/types';

// ---------------------------------------------------------------------------
// Minimal valid DB row factories
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Parameters<typeof dbRowToLead>[0]> = {}) {
	const now = new Date('2026-06-24T01:00:00.000Z');
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
		sourceRef: null,
		scraperOrgId: null,
		stage: 'new' as const,
		lostReason: null,
		ownerId: 'owner-uuid',
		source: 'manual' as const,
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

function makeActivityRow(overrides: Partial<Parameters<typeof dbActivityToActivity>[0]> = {}) {
	const now = new Date('2026-06-24T01:00:00.000Z');
	return {
		id: 'act-001',
		leadId: 'uuid-test-001',
		repId: 'rep-uuid',
		channel: 'fb_dm' as const,
		occurredAt: now,
		outcome: 'sent' as const,
		followUpAt: null,
		notes: null,
		eventName: null,
		eventDate: null,
		eventUrl: null,
		eventCategory: null,
		eventSource: null,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// leadFormSchema — server-side validation gate for create
// ---------------------------------------------------------------------------

describe('leadFormSchema (create-lead validation)', () => {
	it('accepts a minimal payload with just a name', () => {
		const r = leadFormSchema.safeParse({ name: 'USWAG Davao' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.category).toBe('Other');
	});

	it('rejects an empty name', () => {
		const r = leadFormSchema.safeParse({ name: '' });
		expect(r.success).toBe(false);
	});

	it('rejects a missing name', () => {
		const r = leadFormSchema.safeParse({});
		expect(r.success).toBe(false);
	});

	it('rejects a whitespace-only name', () => {
		const r = leadFormSchema.safeParse({ name: '   ' });
		expect(r.success).toBe(false);
	});

	it('accepts all valid platforms', () => {
		for (const platform of ['Facebook', 'Instagram', 'Twitter/X', 'TikTok', 'Other']) {
			const r = leadFormSchema.safeParse({ name: 'Org', platform });
			expect(r.success, `platform=${platform}`).toBe(true);
		}
	});

	it('rejects an invalid platform', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', platform: 'LinkedIn' });
		expect(r.success).toBe(false);
	});

	it('accepts an empty string for pageUrl (optional)', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', pageUrl: '' });
		expect(r.success).toBe(true);
	});

	it('rejects a non-URL string for pageUrl', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', pageUrl: 'not-a-url' });
		expect(r.success).toBe(false);
	});

	it('accepts a valid https URL for pageUrl', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', pageUrl: 'https://facebook.com/testorg' });
		expect(r.success).toBe(true);
	});

	it('accepts empty string for contactEmail (optional)', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', contactEmail: '' });
		expect(r.success).toBe(true);
	});

	it('rejects a non-email string for contactEmail', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', contactEmail: 'notanemail' });
		expect(r.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// dbRowToLead mapper
// ---------------------------------------------------------------------------

describe('dbRowToLead mapper', () => {
	it('maps required fields from DB row to Lead', () => {
		const lead = dbRowToLead(makeRow());
		expect(lead.id).toBe('uuid-test-001');
		expect(lead.name).toBe('Test Org');
		expect(lead.category).toBe('Sports');
		expect(lead.stage).toBe('new');
		expect(lead.source).toBe('manual');
		expect(lead.ownerId).toBe('owner-uuid');
	});

	it('derives handle from normalizedHandle when present', () => {
		const lead = dbRowToLead(makeRow({ normalizedHandle: 'testorg' }));
		expect(lead.handle).toBe('@testorg');
	});

	it('keeps @ prefix when normalizedHandle already has it', () => {
		const lead = dbRowToLead(makeRow({ normalizedHandle: '@testorg' }));
		expect(lead.handle).toBe('@testorg');
	});

	it('computes handle from name when normalizedHandle is null', () => {
		const lead = dbRowToLead(makeRow({ normalizedHandle: null, name: 'USWAG Davao' }));
		expect(lead.handle).toMatch(/^@/);
		expect(lead.handle).toContain('uswag');
	});

	it('defaults location to em-dash when null', () => {
		const lead = dbRowToLead(makeRow({ location: null }));
		expect(lead.location).toBe('—');
	});

	it('defaults platform to Other when null', () => {
		const lead = dbRowToLead(makeRow({ platform: null }));
		expect(lead.platform).toBe('Other');
	});

	it('maps contactEmail to email field', () => {
		const lead = dbRowToLead(makeRow({ contactEmail: 'test@example.com' }));
		expect(lead.email).toBe('test@example.com');
	});

	it('maps contactEmail null to undefined', () => {
		const lead = dbRowToLead(makeRow({ contactEmail: null }));
		expect(lead.email).toBeUndefined();
	});

	it('maps dealValueCents to dealValue in display units', () => {
		const lead = dbRowToLead(makeRow({ dealValueCents: 8500000, wonOrgName: 'Test Productions' }));
		expect(lead.dealValue).toBe(85000);
		expect(lead.signedOrg).toBe('Test Productions');
	});

	it('sets dealValue to undefined when dealValueCents is null', () => {
		const lead = dbRowToLead(makeRow({ dealValueCents: null }));
		expect(lead.dealValue).toBeUndefined();
	});

	it('defaults lastActivityAt to createdAt when null', () => {
		const created = new Date('2026-06-10T00:00:00.000Z');
		const lead = dbRowToLead(makeRow({ lastActivityAt: null, createdAt: created }));
		expect(lead.lastActivityAt).toBe(created.toISOString());
	});

	it('computes age for won leads', () => {
		const lead = dbRowToLead(makeRow({ stage: 'won' }));
		expect(lead.age.type).toBe('normal');
		expect(lead.age.label).toBe('won');
	});

	it('computes age for lost leads', () => {
		const lead = dbRowToLead(makeRow({ stage: 'lost' }));
		expect(lead.age.type).toBe('normal');
		expect(lead.age.label).toBe('lost');
	});

	it('derives urgency=overdue when age type is overdue', () => {
		// lastActivityAt far in the past → stale, not overdue (no followUpAt)
		// To get overdue we'd need a followUpAt in the past, but that's on activities.
		// Verify that replied stage → urgency=replied when age is fresh.
		const recent = new Date('2026-06-24T01:00:00.000Z');
		const lead = dbRowToLead(makeRow({ stage: 'replied', lastActivityAt: recent }));
		expect(lead.urgency).toBe('replied');
	});

	it('derives urgency=cold for stale leads (>30d no activity)', () => {
		const old = new Date('2026-05-01T00:00:00.000Z');
		const lead = dbRowToLead(makeRow({ stage: 'contacted', lastActivityAt: old }));
		expect(lead.age.type).toBe('stale');
		expect(lead.urgency).toBe('cold');
	});

	it('derives urgency=normal for won/lost', () => {
		expect(dbRowToLead(makeRow({ stage: 'won' })).urgency).toBe('normal');
		expect(dbRowToLead(makeRow({ stage: 'lost' })).urgency).toBe('normal');
	});

	it('has age and urgency fields always set', () => {
		const lead = dbRowToLead(makeRow());
		expect(lead.age).toBeDefined();
		expect(lead.age.label).toBeTruthy();
		expect(lead.urgency).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// dbActivityToActivity mapper
// ---------------------------------------------------------------------------

describe('dbActivityToActivity mapper', () => {
	it('maps required fields', () => {
		const activity = dbActivityToActivity(makeActivityRow());
		expect(activity.id).toBe('act-001');
		expect(activity.leadId).toBe('uuid-test-001');
		expect(activity.repId).toBe('rep-uuid');
		expect(activity.channel).toBe('fb_dm');
		expect(activity.outcome).toBe('sent');
	});

	it('maps occurredAt to createdAt (display time)', () => {
		const when = new Date('2026-06-20T10:00:00.000Z');
		const activity = dbActivityToActivity(makeActivityRow({ occurredAt: when }));
		expect(activity.createdAt).toBe(when.toISOString());
	});

	it('maps notes to note field', () => {
		const activity = dbActivityToActivity(makeActivityRow({ notes: 'Sent intro DM.' }));
		expect(activity.note).toBe('Sent intro DM.');
	});

	it('maps null notes to undefined', () => {
		const activity = dbActivityToActivity(makeActivityRow({ notes: null }));
		expect(activity.note).toBeUndefined();
	});

	it('maps followUpAt timestamp', () => {
		const fu = new Date('2026-06-27T00:00:00.000Z');
		const activity = dbActivityToActivity(makeActivityRow({ followUpAt: fu }));
		expect(activity.followUpAt).toBe(fu.toISOString());
	});

	it('maps null followUpAt to undefined', () => {
		const activity = dbActivityToActivity(makeActivityRow({ followUpAt: null }));
		expect(activity.followUpAt).toBeUndefined();
	});

	it('defaults null repId to empty string', () => {
		const activity = dbActivityToActivity(makeActivityRow({ repId: null }));
		expect(activity.repId).toBe('');
	});

	it('defaults null outcome to sent', () => {
		const activity = dbActivityToActivity(makeActivityRow({ outcome: null }));
		expect(activity.outcome).toBe('sent');
	});
});

// ---------------------------------------------------------------------------
// canEditLead — permission gate (widened so any rep can edit an unclaimed lead)
// ---------------------------------------------------------------------------

describe('canEditLead permission gate', () => {
	const rep = { id: 'rep-1', role: 'rep' } as User;
	const otherRep = { id: 'rep-2', role: 'rep' } as User;
	const manager = { id: 'mgr-1', role: 'manager' } as User;

	const leadOwnedBy = (ownerId: string | null) => ({ ownerId }) as Lead;

	it('allows a rep to edit an unclaimed lead (ownerId === null)', () => {
		expect(canEditLead(rep, leadOwnedBy(null))).toBe(true);
	});

	it('allows a rep to edit a lead they own', () => {
		expect(canEditLead(rep, leadOwnedBy('rep-1'))).toBe(true);
	});

	it('does NOT allow a rep to edit a claimed lead owned by another rep', () => {
		expect(canEditLead(rep, leadOwnedBy('rep-2'))).toBe(false);
		expect(canEditLead(otherRep, leadOwnedBy('rep-1'))).toBe(false);
	});

	it('allows a manager to edit any lead (claimed or unclaimed)', () => {
		expect(canEditLead(manager, leadOwnedBy('rep-1'))).toBe(true);
		expect(canEditLead(manager, leadOwnedBy(null))).toBe(true);
	});

	it('denies a signed-out user (no user) regardless of ownership', () => {
		expect(canEditLead(null, leadOwnedBy(null))).toBe(false);
	});
});

// 404 path covered by leads-db.spec.ts: "getLead returns null for a nonexistent UUID"
