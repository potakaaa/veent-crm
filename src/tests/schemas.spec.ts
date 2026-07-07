import { describe, it, expect } from 'vitest';
import {
	leadFormSchema,
	leadUpdateSchema,
	ingestBatchSchema,
	meetingFormSchema,
	meetingUpdateSchema,
	categoryCreateSchema,
	categoryRenameSchema,
	assignCategoriesSchema,
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
	const base = { name: 'Recurring Org' } as const;

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
		const r = leadUpdateSchema.safeParse({ name: 'X', eventDate: '' });
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
// Custom lead categories (CAT-1, GitHub #248) — create / rename / assign schemas
// ---------------------------------------------------------------------------
describe('categoryCreateSchema (CAT-1 AC-1 / AC-10)', () => {
	it('accepts a valid name with an optional hex color', () => {
		const r = categoryCreateSchema.safeParse({ name: 'VIP Leads', color: '#1a2b3c' });
		expect(r.success).toBe(true);
	});

	it('accepts a valid name with no color', () => {
		const r = categoryCreateSchema.safeParse({ name: 'VIP Leads' });
		expect(r.success).toBe(true);
	});

	it('trims surrounding whitespace on the name', () => {
		const r = categoryCreateSchema.safeParse({ name: '  Spaced  ' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.name).toBe('Spaced');
	});

	it('rejects a missing name', () => {
		const r = categoryCreateSchema.safeParse({ color: '#1a2b3c' });
		expect(r.success).toBe(false);
	});

	it('rejects an empty/blank name', () => {
		expect(categoryCreateSchema.safeParse({ name: '' }).success).toBe(false);
		expect(categoryCreateSchema.safeParse({ name: '   ' }).success).toBe(false);
	});

	it('rejects an invalid hex color', () => {
		expect(categoryCreateSchema.safeParse({ name: 'X', color: 'red' }).success).toBe(false);
		expect(categoryCreateSchema.safeParse({ name: 'X', color: '#12' }).success).toBe(false);
		expect(categoryCreateSchema.safeParse({ name: 'X', color: '1a2b3c' }).success).toBe(false);
	});

	it('rejects a name that is too long (> 50 chars)', () => {
		const r = categoryCreateSchema.safeParse({ name: 'a'.repeat(51) });
		expect(r.success).toBe(false);
	});
});

describe('categoryRenameSchema (CAT-1 AC-8)', () => {
	it('accepts a valid rename', () => {
		expect(categoryRenameSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
	});

	it('rejects a missing name', () => {
		expect(categoryRenameSchema.safeParse({}).success).toBe(false);
	});

	it('rejects an empty/blank name', () => {
		expect(categoryRenameSchema.safeParse({ name: '' }).success).toBe(false);
		expect(categoryRenameSchema.safeParse({ name: '   ' }).success).toBe(false);
	});

	it('rejects an invalid hex color', () => {
		expect(categoryRenameSchema.safeParse({ name: 'X', color: 'nope' }).success).toBe(false);
	});

	it('rejects a name that is too long (> 50 chars)', () => {
		expect(categoryRenameSchema.safeParse({ name: 'a'.repeat(51) }).success).toBe(false);
	});
});

describe('assignCategoriesSchema (CAT-1 AC-2 / AC-6)', () => {
	it('accepts a valid UUID categoryId', () => {
		const r = assignCategoriesSchema.safeParse({
			categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
		});
		expect(r.success).toBe(true);
	});

	it('rejects a non-UUID categoryId', () => {
		expect(assignCategoriesSchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(false);
	});

	it('rejects a missing categoryId', () => {
		expect(assignCategoriesSchema.safeParse({}).success).toBe(false);
	});
});
