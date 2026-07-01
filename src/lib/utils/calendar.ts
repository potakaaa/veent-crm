/**
 * Pure date-math helpers for the Calendar page (month/week grid).
 *
 * All functions operate on local-time Date values at day granularity and are
 * DB-free / side-effect-free so the view-range and toggle-preservation logic
 * (AC7/AC8) is unit-testable without a browser or server. Week starts Sunday.
 */

export type CalendarView = 'month' | 'week';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local midnight of the given date. */
export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local end-of-day (23:59:59.999). */
export function endOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Add `n` days (may be negative), preserving local day semantics. */
export function addDays(d: Date, n: number): Date {
	const c = startOfDay(d);
	c.setDate(c.getDate() + n);
	return c;
}

/** First day of the week (Sunday) containing `d`. */
export function startOfWeek(d: Date): Date {
	const s = startOfDay(d);
	s.setDate(s.getDate() - s.getDay());
	return s;
}

/** First day of the month containing `d`. */
export function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Parse a `YYYY-MM-DD` URL param into a local Date. Falls back to `now`'s local
 * day when the param is missing or malformed (so a bad URL never 500s — AC9).
 */
export function parseDateParam(date: string | null | undefined, now: Date = new Date()): Date {
	if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
		const [y, m, d] = date.split('-').map(Number);
		const dt = new Date(y, m - 1, d);
		// Reject overflow dates (e.g. 2026-13-99 rolls forward) by requiring the
		// constructed components to round-trip exactly.
		if (
			!Number.isNaN(dt.getTime()) &&
			dt.getFullYear() === y &&
			dt.getMonth() === m - 1 &&
			dt.getDate() === d
		) {
			return dt;
		}
	}
	return startOfDay(now);
}

/** Serialize a Date to a `YYYY-MM-DD` URL param (local day). */
export function toDateParam(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The visible fetch window for a view anchored at `date`.
 *   - week: the Sun→Sat week containing `date`
 *   - month: the full 6-week (42-cell) grid that renders that month, including
 *     leading/trailing spillover days shown in the grid.
 */
export function computeRange(view: CalendarView, date: Date): { start: Date; end: Date } {
	if (view === 'week') {
		const start = startOfWeek(date);
		return { start, end: endOfDay(addDays(start, 6)) };
	}
	const gridStart = startOfWeek(startOfMonth(date));
	return { start: gridStart, end: endOfDay(addDays(gridStart, 41)) };
}

/** The 42 day cells (6 weeks) rendered for the month containing `date`. */
export function monthGridDays(date: Date): Date[] {
	const gridStart = startOfWeek(startOfMonth(date));
	return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** The 7 day cells (Sun→Sat) rendered for the week containing `date`. */
export function weekDays(date: Date): Date[] {
	const s = startOfWeek(date);
	return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** True when `a` and `b` are the same local calendar day. */
export function sameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Shift the anchor date by one period in `dir`. Week → ±7 days; month → ±1 month
 * (anchored to the 1st). Powers the prev/next range navigation.
 */
export function shiftDate(view: CalendarView, date: Date, dir: 'prev' | 'next'): Date {
	const delta = dir === 'next' ? 1 : -1;
	if (view === 'week') return addDays(date, 7 * delta);
	return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}
