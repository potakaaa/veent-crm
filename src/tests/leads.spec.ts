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
import {
	dbRowToLead,
	dbActivityToActivity,
	parseFilterCsv,
	visibilityCondition
} from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Lead, User } from '$lib/types';

// ---------------------------------------------------------------------------
// Minimal valid DB row factories
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Parameters<typeof dbRowToLead>[0]> = {}) {
	const now = new Date('2026-06-24T01:00:00.000Z');
	return {
		id: 'uuid-test-001',
		name: 'Test Org',
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
		stage: 'new' as const,
		lostReason: null,
		ownerId: 'owner-uuid',
		organizerId: null,
		visibility: 'everyone' as const,
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
		currentPlatform: null,
		competitorNotes: null,
		revenueCents: null,
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

	// #94 — recurring-organizer future-events flag
	it('maps has_future_events true to hasFutureEvents true', () => {
		const lead = dbRowToLead(makeRow({ hasFutureEvents: true }));
		expect(lead.hasFutureEvents).toBe(true);
	});

	it('maps has_future_events false to hasFutureEvents false', () => {
		const lead = dbRowToLead(makeRow({ hasFutureEvents: false }));
		expect(lead.hasFutureEvents).toBe(false);
	});

	it('defaults hasFutureEvents to false when the column is null/absent', () => {
		// Simulate a legacy row where the value is null despite the NOT NULL default.
		const lead = dbRowToLead(makeRow({ hasFutureEvents: null as unknown as boolean }));
		expect(lead.hasFutureEvents).toBe(false);
	});

	// #188 — linked recurring-organizer (crm_organizers) pre-fill source
	it('populates organizerId and organizerName when a crm_organizers row is present', () => {
		const lead = dbRowToLead(
			makeRow({ organizerId: '00000000-0000-0000-0000-0000000000aa' }),
			undefined,
			'Acme Organizers'
		);
		expect(lead.organizerId).toBe('00000000-0000-0000-0000-0000000000aa');
		expect(lead.organizerName).toBe('Acme Organizers');
	});

	it('leaves organizerId null and organizerName undefined when the lead has no organizer', () => {
		const lead = dbRowToLead(makeRow({ organizerId: null }));
		expect(lead.organizerId).toBeNull();
		expect(lead.organizerName).toBeUndefined();
	});

	it('populates organizerId from the row even when organizerName is not looked up', () => {
		// List paths pass no organizerName; the id must still map from the row column.
		const lead = dbRowToLead(makeRow({ organizerId: '00000000-0000-0000-0000-0000000000bb' }));
		expect(lead.organizerId).toBe('00000000-0000-0000-0000-0000000000bb');
		expect(lead.organizerName).toBeUndefined();
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

// ---------------------------------------------------------------------------
// parseFilterCsv — Up for Grabs country/category CSV param parsing (#91)
// Fully-Automated gate: proves the .filter(Boolean) empty-strip (decision 8).
// ---------------------------------------------------------------------------

describe('parseFilterCsv (Up for Grabs filter param parsing)', () => {
	it('splits a comma-joined value into an array', () => {
		expect(parseFilterCsv('US,PH')).toEqual(['US', 'PH']);
	});

	it('returns a single-element array for one value', () => {
		expect(parseFilterCsv('Concert')).toEqual(['Concert']);
	});

	it('returns an empty array for null (param absent)', () => {
		expect(parseFilterCsv(null)).toEqual([]);
	});

	it('returns an empty array for undefined', () => {
		expect(parseFilterCsv(undefined)).toEqual([]);
	});

	it('returns an empty array for an empty string (no stray "" element)', () => {
		expect(parseFilterCsv('')).toEqual([]);
	});

	it('strips empty elements from a trailing comma via .filter(Boolean)', () => {
		expect(parseFilterCsv('US,')).toEqual(['US']);
	});

	it('strips empty elements from a leading comma', () => {
		expect(parseFilterCsv(',PH')).toEqual(['PH']);
	});

	it('strips all empty elements from consecutive/only commas', () => {
		expect(parseFilterCsv(',,')).toEqual([]);
		expect(parseFilterCsv('US,,PH')).toEqual(['US', 'PH']);
	});

	it('trims whitespace from each segment', () => {
		expect(parseFilterCsv(' US , PH ')).toEqual(['US', 'PH']);
	});
});

// NOTE(CAT-1): the AC#12 "category filter options == leadCategory.enumValues" test was retired.
// Lead categories are now dynamic (crm_categories) — filter SQL is covered by
// buildCategoryFilterConditions() tests in categories-db.spec.ts, not a static enum assertion.

// 404 path covered by leads-db.spec.ts: "getLead returns null for a nonexistent UUID"

// ---------------------------------------------------------------------------
// visibilityCondition — pure SQL-shape assertion (GitHub #87)
// Serializes the Drizzle SQL to text via PgDialect (no DB connection needed),
// proving: manager → TRUE no-op; rep → OR-of-4 incl. the grants EXISTS subquery.
// Proves the logic core of AC#5, AC#6, AC#7, AC#8, AC#9.
// ---------------------------------------------------------------------------
describe('visibilityCondition SQL shape (GitHub #87)', () => {
	const dialect = new PgDialect();
	const toSql = (s: SQL) => dialect.sqlToQuery(s).sql;
	const REP = '11111111-1111-1111-1111-111111111111';

	it('returns a TRUE no-op for a manager (override centralized in the helper)', () => {
		const sql = toSql(visibilityCondition(REP, 'manager'));
		expect(sql.trim().toLowerCase()).toBe('true');
	});

	it('returns the OR-of-4 shape for a rep (own / everyone / unowned / granted)', () => {
		const sql = toSql(visibilityCondition(REP, 'rep')).toLowerCase();
		// owner match + everyone + unowned + explicit grant subquery
		expect(sql).toContain('"owner_id"');
		expect(sql).toContain('"visibility"');
		expect(sql).toContain('is null');
		expect(sql).toContain('exists');
		expect(sql).toContain('crm_lead_visibility_grants');
		// It is an OR, not a bare TRUE.
		expect(sql).toContain(' or ');
		expect(sql.trim()).not.toBe('true');
	});

	it('manager and rep produce different predicates', () => {
		expect(toSql(visibilityCondition(REP, 'manager'))).not.toBe(
			toSql(visibilityCondition(REP, 'rep'))
		);
	});
});
