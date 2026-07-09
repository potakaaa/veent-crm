import { describe, expect, it } from 'vitest';
import { formatFullName } from '$lib/utils/format-name';

describe('formatFullName', () => {
	it('returns first name only when no last name', () => {
		expect(formatFullName('Jane', undefined)).toBe('Jane');
	});

	it('joins first and last name with a single space', () => {
		expect(formatFullName('Jane', 'Diaz')).toBe('Jane Diaz');
	});

	it('returns first name only when lastName is null', () => {
		expect(formatFullName('Jane', null)).toBe('Jane');
	});

	it('returns first name only when lastName is undefined', () => {
		expect(formatFullName('Jane', undefined)).toBe('Jane');
	});

	it('returns first name only when lastName is an empty string (falsy)', () => {
		expect(formatFullName('Jane', '')).toBe('Jane');
	});

	it('AC8 regression: derived name equals old verbatim-backfilled name', () => {
		// Simulates a pre-existing row backfilled verbatim: first_name = old "name", last_name = null.
		const oldStoredName = 'Jane Diaz';
		expect(formatFullName(oldStoredName, null)).toBe(oldStoredName);
	});
});
