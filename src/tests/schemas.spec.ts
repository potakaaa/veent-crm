import { describe, it, expect } from 'vitest';
import {
	leadFormSchema,
	leadUpdateSchema,
	ingestBatchSchema,
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
