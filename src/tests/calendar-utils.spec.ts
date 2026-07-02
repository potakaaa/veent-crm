/**
 * Pure unit coverage for the calendar date-math utilities (Phase 2/4).
 *
 * Strengthens AC7 (view toggle) and AC8 (toggle preserves date context) at the
 * unit level in addition to their e2e gates: the toggle-preservation invariant is
 * that the anchor `date` stays inside the visible window for BOTH views.
 */
import { describe, it, expect } from 'vitest';
import {
	computeRange,
	monthGridDays,
	weekDays,
	shiftDate,
	sameLocalDay,
	parseDateParam,
	toDateParam,
	startOfWeek,
	startOfMonth
} from '$lib/utils/calendar';

const anchor = new Date(2026, 6, 15); // 15 Jul 2026 (local)

describe('computeRange', () => {
	it('week range is the Sun→Sat week containing the anchor and contains the anchor', () => {
		const { start, end } = computeRange('week', anchor);
		expect(start.getDay()).toBe(0); // Sunday
		expect(anchor.getTime()).toBeGreaterThanOrEqual(start.getTime());
		expect(anchor.getTime()).toBeLessThanOrEqual(end.getTime());
		// 7-day span (end is end-of-day of start+6)
		expect(Math.floor((end.getTime() - start.getTime()) / 86_400_000)).toBe(6);
	});

	it('month range spans the full 6-week grid and contains the anchor', () => {
		const { start, end } = computeRange('month', anchor);
		expect(start.getDay()).toBe(0);
		expect(anchor.getTime()).toBeGreaterThanOrEqual(start.getTime());
		expect(anchor.getTime()).toBeLessThanOrEqual(end.getTime());
		expect(Math.floor((end.getTime() - start.getTime()) / 86_400_000)).toBe(41);
	});
});

describe('AC8 — toggling view preserves the anchor date context', () => {
	it('the same anchor date falls inside both the month and week windows', () => {
		const month = computeRange('month', anchor);
		const week = computeRange('week', anchor);
		for (const r of [month, week]) {
			expect(anchor.getTime()).toBeGreaterThanOrEqual(r.start.getTime());
			expect(anchor.getTime()).toBeLessThanOrEqual(r.end.getTime());
		}
	});

	it('holds for an off-current, arbitrary anchor (not reset to today)', () => {
		const far = new Date(2027, 0, 3); // 3 Jan 2027
		const month = computeRange('month', far);
		const week = computeRange('week', far);
		for (const r of [month, week]) {
			expect(far.getTime()).toBeGreaterThanOrEqual(r.start.getTime());
			expect(far.getTime()).toBeLessThanOrEqual(r.end.getTime());
		}
	});
});

describe('grid day generation', () => {
	it('monthGridDays returns 42 cells starting on a Sunday', () => {
		const days = monthGridDays(anchor);
		expect(days).toHaveLength(42);
		expect(days[0].getDay()).toBe(0);
		expect(days[0].getTime()).toBe(startOfWeek(startOfMonth(anchor)).getTime());
	});

	it('weekDays returns 7 consecutive days starting on a Sunday', () => {
		const days = weekDays(anchor);
		expect(days).toHaveLength(7);
		expect(days[0].getDay()).toBe(0);
		expect(days[6].getDay()).toBe(6);
	});
});

describe('shiftDate (prev/next navigation)', () => {
	it('week shifts by ±7 days', () => {
		expect(shiftDate('week', anchor, 'next').getTime()).toBe(new Date(2026, 6, 22).getTime());
		expect(shiftDate('week', anchor, 'prev').getTime()).toBe(new Date(2026, 6, 8).getTime());
	});

	it('month shifts by ±1 month, anchored to the 1st', () => {
		expect(toDateParam(shiftDate('month', anchor, 'next'))).toBe('2026-08-01');
		expect(toDateParam(shiftDate('month', anchor, 'prev'))).toBe('2026-06-01');
	});

	it('month shift rolls over year boundaries', () => {
		const dec = new Date(2026, 11, 10);
		expect(toDateParam(shiftDate('month', dec, 'next'))).toBe('2027-01-01');
	});
});

describe('parseDateParam / toDateParam', () => {
	it('round-trips a valid YYYY-MM-DD param', () => {
		expect(toDateParam(parseDateParam('2026-07-15'))).toBe('2026-07-15');
	});

	it('falls back to now for missing or malformed params (AC9 defensive)', () => {
		const now = new Date(2026, 6, 1);
		expect(toDateParam(parseDateParam(null, now))).toBe('2026-07-01');
		expect(toDateParam(parseDateParam('garbage', now))).toBe('2026-07-01');
		expect(toDateParam(parseDateParam('2026-13-99', now))).toBe('2026-07-01');
	});
});

describe('sameLocalDay', () => {
	it('is true for two times on the same local day, false across days', () => {
		expect(sameLocalDay(new Date(2026, 6, 15, 9), new Date(2026, 6, 15, 22))).toBe(true);
		expect(sameLocalDay(new Date(2026, 6, 15), new Date(2026, 6, 16))).toBe(false);
	});
});
