import { describe, it, expect } from 'vitest';
import { CalendarDate } from '@internationalized/date';
import { formatEventDate } from '$lib/utils/dates';

// ---------------------------------------------------------------------------
// formatEventDate — the /leads/new calendar-picker label formatter
// ---------------------------------------------------------------------------
describe('formatEventDate', () => {
	it('formats a DateValue as "D Mon YYYY"', () => {
		expect(formatEventDate(new CalendarDate(2026, 7, 12))).toBe('12 Jul 2026');
	});

	it('does not zero-pad single-digit days', () => {
		expect(formatEventDate(new CalendarDate(2026, 1, 5))).toBe('5 Jan 2026');
	});

	it('uses the abbreviated month name', () => {
		expect(formatEventDate(new CalendarDate(2025, 12, 25))).toBe('25 Dec 2025');
	});
});
