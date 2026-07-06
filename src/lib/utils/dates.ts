/**
 * Date helpers for the Veent CRM. All time-sensitive computations accept an
 * optional `now` parameter so tests can inject a fixed reference point.
 */
import { getLocalTimeZone, type DateValue } from '@internationalized/date';
import type { AgeType, Lead } from '$lib/types';

export const TIMEZONE = 'Asia/Manila';

/**
 * Format a calendar selection (a `DateValue` from `@internationalized/date`)
 * as a human label like "12 Jul 2026" for the event-date field.
 */
export function formatEventDate(value: DateValue): string {
	return value
		.toDate(getLocalTimeZone())
		.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const DAY = 86_400_000;

export const daysBetween = (a: Date, b: Date): number =>
	Math.floor((b.getTime() - a.getTime()) / DAY);

export function formatDate(iso: string | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-PH', {
		month: 'short',
		day: 'numeric',
		...opts,
		timeZone: TIMEZONE
	});
}

export const todayLabel = (): string =>
	new Date().toLocaleDateString('en-PH', {
		timeZone: TIMEZONE,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

/** Human "5m ago" / "2h ago" / "3d ago" relative to a reference point (defaults to now). */
export function relativeFromNow(iso: string | undefined, now = new Date()): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const diff = now.getTime() - d.getTime();
	if (diff < 0) return formatDate(iso);
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Compute an age badge from a lead's follow-up / last-activity timestamps.
 *
 * `now` defaults to live `new Date()` so server-side urgency matches SQL `now()`
 * (C6 fix). Pass an explicit reference time for deterministic tests / mock data.
 */
export function computeAge(
	lead: Pick<Lead, 'followUpAt' | 'lastActivityAt' | 'stage'>,
	now: Date = new Date()
): {
	label: string;
	type: AgeType;
} {
	if (lead.stage === 'won') return { label: 'won', type: 'normal' };
	if (lead.stage === 'lost') return { label: 'lost', type: 'normal' };

	if (lead.followUpAt) {
		const due = daysBetween(now, new Date(lead.followUpAt));
		if (due < 0) return { label: `${Math.abs(due)}d overdue`, type: 'overdue' };
		if (due === 0) return { label: 'due today', type: 'due' };
	}
	const idle = daysBetween(new Date(lead.lastActivityAt), now);
	if (idle > 30) return { label: `${idle}d cold`, type: 'stale' };
	if (idle <= 1) return { label: relativeFromNow(lead.lastActivityAt, now), type: 'fresh' };
	return { label: `${idle}d`, type: 'normal' };
}

export const addDays = (iso: string, days: number): string => {
	const d = new Date(iso);
	d.setDate(d.getDate() + days);
	return d.toISOString();
};

/**
 * Return a YYYY-MM-DD date string for N days from `now` in Asia/Manila time
 * (UTC+8, no DST). Mirrors the server-side parse in /api/leads/[id]/touch:
 * `new Date(dateStr + 'T00:00:00+08:00')`.
 */
export function followUpDate(days: number, now: Date = new Date()): string {
	// Shift to Manila-local clock (UTC+8), then add days on the UTC date fields.
	const manila = new Date(now.getTime() + 8 * 3_600_000);
	manila.setUTCDate(manila.getUTCDate() + days);
	return manila.toISOString().slice(0, 10);
}
