/**
 * Unit tests for NCAL-4 Zod schema extensions.
 *
 * Proves AC12: createCalendarEventSchema and updateCalendarEventSchema accept
 * attendees, color, status, rrule optional fields; required fields still enforce;
 * end <= start refine still fires.
 */
import { describe, it, expect } from 'vitest';
import { createCalendarEventSchema, updateCalendarEventSchema } from '$lib/zod/schemas';

const BASE_VALID = {
	title: 'Team event',
	start: '2026-07-09T10:00:00Z',
	end: '2026-07-09T11:00:00Z'
};

describe('createCalendarEventSchema — AC12 optional field extensions', () => {
	it('accepts a minimal valid payload (no new fields)', () => {
		const result = createCalendarEventSchema.safeParse(BASE_VALID);
		expect(result.success).toBe(true);
	});

	it('accepts attendees as an array of valid email strings', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			attendees: ['alice@example.com', 'bob@example.com']
		});
		expect(result.success).toBe(true);
	});

	it('rejects attendees with non-email elements', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			attendees: ['not-an-email', 'valid@example.com']
		});
		expect(result.success).toBe(false);
	});

	it('accepts a valid hex color', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			color: '#7c3aed'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a non-hex color string', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			color: 'purple'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a malformed hex (5 digits)', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			color: '#7c3ae'
		});
		expect(result.success).toBe(false);
	});

	it('accepts status: confirmed', () => {
		const result = createCalendarEventSchema.safeParse({ ...BASE_VALID, status: 'confirmed' });
		expect(result.success).toBe(true);
	});

	it('accepts status: tentative', () => {
		const result = createCalendarEventSchema.safeParse({ ...BASE_VALID, status: 'tentative' });
		expect(result.success).toBe(true);
	});

	it('accepts status: cancelled', () => {
		const result = createCalendarEventSchema.safeParse({ ...BASE_VALID, status: 'cancelled' });
		expect(result.success).toBe(true);
	});

	it('rejects an invalid status value', () => {
		const result = createCalendarEventSchema.safeParse({ ...BASE_VALID, status: 'pending' });
		expect(result.success).toBe(false);
	});

	it('accepts rrule as an arbitrary string', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			rrule: 'FREQ=WEEKLY;BYDAY=MO'
		});
		expect(result.success).toBe(true);
	});

	it('accepts all new optional fields together', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			attendees: ['alice@example.com'],
			color: '#ff0000',
			status: 'confirmed',
			rrule: 'FREQ=DAILY'
		});
		expect(result.success).toBe(true);
	});

	it('still enforces title required — empty title fails', () => {
		const result = createCalendarEventSchema.safeParse({ ...BASE_VALID, title: '' });
		expect(result.success).toBe(false);
	});

	it('still enforces end > start refine', () => {
		const result = createCalendarEventSchema.safeParse({
			...BASE_VALID,
			end: '2026-07-09T09:00:00Z' // before start
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const fieldErrors = result.error.flatten().fieldErrors;
			expect(fieldErrors.end ?? []).toContain('end must be after start');
		}
	});
});

describe('updateCalendarEventSchema — AC12 optional field extensions (same shape as create)', () => {
	it('accepts attendees, color, status, rrule', () => {
		const result = updateCalendarEventSchema.safeParse({
			...BASE_VALID,
			attendees: ['test@example.com'],
			color: '#123abc',
			status: 'tentative',
			rrule: 'FREQ=MONTHLY'
		});
		expect(result.success).toBe(true);
	});

	it('still enforces end > start refine', () => {
		const result = updateCalendarEventSchema.safeParse({
			...BASE_VALID,
			end: BASE_VALID.start // equal — not after
		});
		expect(result.success).toBe(false);
	});
});
