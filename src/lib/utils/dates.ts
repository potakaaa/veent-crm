/**
 * Date helpers. The prototype anchors "now" to the design's reference moment
 * (Tue 24 Jun 2026, Asia/Manila) so computed ages match the mock data.
 * Swap NOW for `new Date()` once the backend supplies live timestamps.
 */
import type { AgeType, Lead } from '$lib/types';

export const TIMEZONE = 'Asia/Manila';
export const NOW = new Date('2026-06-24T09:00:00+08:00');

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
	NOW.toLocaleDateString('en-PH', {
		timeZone: TIMEZONE,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

/** Human "2h ago" / "3d ago" relative to `now` (defaults to the frozen NOW anchor for display helpers). */
export function relativeFromNow(iso: string | undefined, now: Date = NOW): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const diff = now.getTime() - d.getTime();
	if (diff < 0) return formatDate(iso);
	const hours = Math.floor(diff / 3_600_000);
	if (hours < 1) return 'just now';
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
