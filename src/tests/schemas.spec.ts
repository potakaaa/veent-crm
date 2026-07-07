import { describe, it, expect } from 'vitest';
import {
	leadFormSchema,
	leadUpdateSchema,
	ingestBatchSchema,
	meetingFormSchema,
	meetingUpdateSchema,
	userNameEditSchema,
	LEAD_STAGES,
	USER_ROLES
} from '$lib/zod/schemas';
import { roleLabel } from '$lib/utils/roles';

// Placeholder unit tests — prove the Zod validators (which double as import/ingest validators) load.
describe('zod schemas (stub)', () => {
	it('accepts a minimal valid lead', () => {
		const r = leadFormSchema.safeParse({ name: 'USWAG Davao' });
		expect(r.success).toBe(true);
	});

	it('rejects a lead with no name', () => {
		const r = leadFormSchema.safeParse({ name: '' });
		expect(r.success).toBe(false);
	});

	it('validates an ingest batch', () => {
		const r = ingestBatchSchema.safeParse({ leads: [{ pageName: 'Some Page' }] });
		expect(r.success).toBe(true);
	});

	it('has the seven pipeline stages', () => {
		expect(LEAD_STAGES).toContain('in_discussion');
		expect(LEAD_STAGES).toContain('live');
		expect(LEAD_STAGES.length).toBe(7);
	});
});

// ---------------------------------------------------------------------------
// leadUpdateSchema — hasFutureEvents flag (GitHub #94, AC1/AC2 schema layer)
// ---------------------------------------------------------------------------
describe('leadUpdateSchema hasFutureEvents flag (#94)', () => {
	const base = { name: 'Recurring Org', category: 'Concert' } as const;

	it('accepts hasFutureEvents: true', () => {
		const r = leadUpdateSchema.safeParse({ ...base, hasFutureEvents: true });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.hasFutureEvents).toBe(true);
	});

	it('accepts hasFutureEvents: false', () => {
		const r = leadUpdateSchema.safeParse({ ...base, hasFutureEvents: false });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.hasFutureEvents).toBe(false);
	});

	it('treats hasFutureEvents as optional (omission is valid)', () => {
		const r = leadUpdateSchema.safeParse({ ...base });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.hasFutureEvents).toBeUndefined();
	});

	it('rejects a non-boolean hasFutureEvents', () => {
		const r = leadUpdateSchema.safeParse({ ...base, hasFutureEvents: 'yes' });
		expect(r.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// leadFormSchema — organizerId pre-fill (GitHub #190, AC7 schema half)
// ---------------------------------------------------------------------------
describe('leadFormSchema organizerId (#190)', () => {
	const UUID = '00000000-0000-0000-0000-000000000001';

	it('accepts a UUID-shaped organizerId', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', organizerId: UUID });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.organizerId).toBe(UUID);
	});

	it('accepts an omitted organizerId (optional)', () => {
		const r = leadFormSchema.safeParse({ name: 'Org' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.organizerId).toBeUndefined();
	});

	it('rejects a non-UUID organizerId', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', organizerId: 'not-a-uuid' });
		expect(r.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// leadUpdateSchema — eventDate empty-string clear path (GitHub #195)
// ---------------------------------------------------------------------------
describe('leadUpdateSchema eventDate clear path (#195)', () => {
	it('accepts an empty-string eventDate (cleared/unset)', () => {
		const r = leadUpdateSchema.safeParse({ name: 'X', category: 'Concert', eventDate: '' });
		expect(r.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// super_manager role (GitHub #73)
// ---------------------------------------------------------------------------
describe('super_manager role (GitHub #73)', () => {
	it('includes super_manager in USER_ROLES', () => {
		expect(USER_ROLES).toContain('super_manager');
	});

	it('still includes rep and manager', () => {
		expect(USER_ROLES).toContain('rep');
		expect(USER_ROLES).toContain('manager');
	});

	it("roleLabel('super_manager') === 'Super Manager'", () => {
		expect(roleLabel('super_manager')).toBe('Super Manager');
	});

	it('labels the base roles', () => {
		expect(roleLabel('rep')).toBe('Rep');
		expect(roleLabel('manager')).toBe('Manager');
	});
});

// ---------------------------------------------------------------------------
// userNameEditSchema — name-only edit (team member profile edit)
// ---------------------------------------------------------------------------
describe('userNameEditSchema (name-only edit)', () => {
	it('rejects an empty name', () => {
		const r = userNameEditSchema.safeParse({ name: '' });
		expect(r.success).toBe(false);
	});

	it('accepts a valid name', () => {
		const r = userNameEditSchema.safeParse({ name: 'Marites' });
		expect(r.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Lead visibility scoping (GitHub #87)
// ---------------------------------------------------------------------------
describe('leadFormSchema — visibility (GitHub #87)', () => {
	it('defaults visibility to everyone when omitted (AC#2)', () => {
		const r = leadFormSchema.safeParse({ name: 'USWAG Davao' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.visibility).toBe('everyone');
	});

	it('accepts an explicit only_me visibility', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', visibility: 'only_me' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.visibility).toBe('only_me');
	});

	it('rejects an unknown visibility value', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', visibility: 'public' });
		expect(r.success).toBe(false);
	});

	it('rejects selected visibility with no selectedUserIds (AC#1)', () => {
		const r = leadFormSchema.safeParse({ name: 'Org', visibility: 'selected' });
		expect(r.success).toBe(false);
	});

	it('rejects selected visibility with an empty selectedUserIds array (AC#1)', () => {
		const r = leadFormSchema.safeParse({
			name: 'Org',
			visibility: 'selected',
			selectedUserIds: []
		});
		expect(r.success).toBe(false);
	});

	it('accepts selected visibility with at least one grantee (AC#1)', () => {
		const r = leadFormSchema.safeParse({
			name: 'Org',
			visibility: 'selected',
			selectedUserIds: ['11111111-1111-1111-1111-111111111111']
		});
		expect(r.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// meeting schemas — leadOrganizerId (crm_organizers pre-fill link, GitHub #188)
// ---------------------------------------------------------------------------

describe('meetingFormSchema leadOrganizerId (create)', () => {
	const base = {
		leadId: '11111111-1111-4111-8111-111111111111',
		startAt: '2026-07-06T10:00:00.000Z'
	};

	it('accepts a valid leadOrganizerId uuid', () => {
		const r = meetingFormSchema.safeParse({
			...base,
			leadOrganizerId: '22222222-2222-4222-8222-222222222222'
		});
		expect(r.success).toBe(true);
	});

	it('accepts null leadOrganizerId (no linked organizer)', () => {
		const r = meetingFormSchema.safeParse({ ...base, leadOrganizerId: null });
		expect(r.success).toBe(true);
	});

	it('accepts an omitted leadOrganizerId (optional)', () => {
		const r = meetingFormSchema.safeParse(base);
		expect(r.success).toBe(true);
	});

	it('rejects a malformed leadOrganizerId', () => {
		const r = meetingFormSchema.safeParse({ ...base, leadOrganizerId: 'not-a-uuid' });
		expect(r.success).toBe(false);
	});
});

describe('meetingUpdateSchema leadOrganizerId (edit)', () => {
	it('accepts a valid leadOrganizerId uuid', () => {
		const r = meetingUpdateSchema.safeParse({
			leadOrganizerId: '22222222-2222-4222-8222-222222222222'
		});
		expect(r.success).toBe(true);
	});

	it('accepts null leadOrganizerId (explicit clear on edit)', () => {
		const r = meetingUpdateSchema.safeParse({ leadOrganizerId: null });
		expect(r.success).toBe(true);
	});

	it('accepts an omitted leadOrganizerId (field untouched)', () => {
		const r = meetingUpdateSchema.safeParse({});
		expect(r.success).toBe(true);
	});

	it('rejects a malformed leadOrganizerId', () => {
		const r = meetingUpdateSchema.safeParse({ leadOrganizerId: 'nope' });
		expect(r.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Meeting Venue free-text field (GitHub #250, AC1)
// ---------------------------------------------------------------------------
describe('meetingFormSchema venue (#250 AC1)', () => {
	const base = {
		leadId: '11111111-1111-4111-8111-111111111111',
		startAt: '2026-07-06T10:00:00.000Z'
	};

	it('accepts an arbitrary free-text venue string', () => {
		const r = meetingFormSchema.safeParse({ ...base, venue: 'Ayala Center Cebu, 3rd Floor' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.venue).toBe('Ayala Center Cebu, 3rd Floor');
	});

	it('accepts an omitted venue (optional)', () => {
		const r = meetingFormSchema.safeParse(base);
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.venue).toBeUndefined();
	});

	it('accepts an empty-string venue (no min-length constraint)', () => {
		const r = meetingFormSchema.safeParse({ ...base, venue: '' });
		expect(r.success).toBe(true);
	});

	it('imposes no format constraint (URLs, punctuation, emoji all valid)', () => {
		const r = meetingFormSchema.safeParse({ ...base, venue: 'https://maps.app/x — Room #2 🎪' });
		expect(r.success).toBe(true);
	});
});

describe('meetingUpdateSchema venue (#250 AC1)', () => {
	it('accepts an arbitrary free-text venue string on edit', () => {
		const r = meetingUpdateSchema.safeParse({ venue: 'SM Seaside' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.venue).toBe('SM Seaside');
	});

	it('accepts an omitted venue (field untouched)', () => {
		const r = meetingUpdateSchema.safeParse({});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.venue).toBeUndefined();
	});

	it('accepts an empty-string venue (cleared)', () => {
		const r = meetingUpdateSchema.safeParse({ venue: '' });
		expect(r.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Organizer Name stays free-text — no enum / must-match constraint (GitHub #250, AC3)
// ---------------------------------------------------------------------------
describe('lead name field is free-text (#250 AC3)', () => {
	it('leadFormSchema accepts a brand-new organizer name with no matching suggestion', () => {
		const r = leadFormSchema.safeParse({ name: 'Totally New Organizer 12345 !@#' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.name).toBe('Totally New Organizer 12345 !@#');
	});

	it('leadUpdateSchema accepts a brand-new organizer name (no enum/refine block)', () => {
		const r = leadUpdateSchema.safeParse({ name: 'Some Unlisted Venue Org', category: 'Other' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.name).toBe('Some Unlisted Venue Org');
	});

	it('trims and requires non-empty (the ONLY constraint — no membership check)', () => {
		expect(leadFormSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(leadFormSchema.safeParse({ name: 'A' }).success).toBe(true);
	});
});
