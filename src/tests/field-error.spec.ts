import { describe, it, expect } from 'vitest';
import {
	fieldErrorId,
	firstFieldError,
	fieldErrorAttrs
} from '$lib/components/ui/field-error/field-error';
import { leadFormSchema, userFormSchema } from '$lib/zod/schemas';

// ---------------------------------------------------------------------------
// Phase 4 (sitewide-ux-refresh) — shared field-error component ARIA wiring.
//
// B4: proves the shared field-error wiring maps per-field error props to the
// rendered `aria-invalid`/`aria-describedby`/error-id contract. This is the
// non-e2e proof for SPEC AC6 (the e2e specs self-skip under the shared
// auth-fixture known-gap). Testing the pure helper — rather than a rendered
// Svelte component — because the repo has no jsdom / component-render vitest
// project (server/node project only). The FieldError.svelte component is a thin
// consumer of these helpers, so this covers the ARIA contract deterministically.
// ---------------------------------------------------------------------------

describe('field-error ARIA wiring (B4 — AC6 non-e2e proof)', () => {
	it('derives a stable error-message id from the control id', () => {
		expect(fieldErrorId('name')).toBe('name-error');
		expect(fieldErrorId('rep-email')).toBe('rep-email-error');
	});

	it('collapses a Zod fieldErrors string[] to its first message', () => {
		expect(firstFieldError(['Name is required', 'second'])).toBe('Name is required');
	});

	it('accepts a plain string (hand-rolled checks, e.g. Meeting modal)', () => {
		expect(firstFieldError('Set a date and time.')).toBe('Set a date and time.');
	});

	it('treats undefined / null / empty as "no error"', () => {
		expect(firstFieldError(undefined)).toBeUndefined();
		expect(firstFieldError(null)).toBeUndefined();
		expect(firstFieldError('')).toBeUndefined();
		expect(firstFieldError([])).toBeUndefined();
	});

	it('emits aria-invalid + aria-describedby only when a message exists', () => {
		expect(fieldErrorAttrs('name', ['Page / organizer name is required'])).toEqual({
			'aria-invalid': 'true',
			'aria-describedby': 'name-error'
		});
	});

	it('emits both attributes as undefined on a valid field', () => {
		expect(fieldErrorAttrs('name', undefined)).toEqual({
			'aria-invalid': undefined,
			'aria-describedby': undefined
		});
	});

	it('wires real leadFormSchema.flatten().fieldErrors output into per-field ARIA', () => {
		const parsed = leadFormSchema.safeParse({ name: '' });
		expect(parsed.success).toBe(false);
		if (parsed.success) return;
		const fieldErrors = parsed.error.flatten().fieldErrors;
		const attrs = fieldErrorAttrs('name', fieldErrors.name);
		expect(attrs['aria-invalid']).toBe('true');
		expect(attrs['aria-describedby']).toBe('name-error');
		expect(firstFieldError(fieldErrors.name)).toBe('Page / organizer name is required');
	});

	it('wires real userFormSchema.flatten().fieldErrors output (Team invite)', () => {
		const parsed = userFormSchema.safeParse({
			firstName: '',
			email: 'not-an-email',
			role: 'rep'
		});
		expect(parsed.success).toBe(false);
		if (parsed.success) return;
		const fieldErrors = parsed.error.flatten().fieldErrors;
		expect(fieldErrorAttrs('rep-first-name', fieldErrors.firstName)['aria-invalid']).toBe('true');
		expect(fieldErrorAttrs('rep-email', fieldErrors.email)['aria-describedby']).toBe(
			'rep-email-error'
		);
	});
});
