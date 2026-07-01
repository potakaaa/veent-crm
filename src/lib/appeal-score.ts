// Lead Appeal Score — pure, unpersisted scoring function.
// Recomputed at render/sort time from three date fields, so it is never stale.
// Primitive args only (string | Date | null) and NO `db` import, so it is safe to import
// from both client and server ($lib) and serves MockLead + a future CrmLead unchanged.

type DateInput = string | Date | null | undefined;

const MS_PER_DAY = 86_400_000;

/** Whole-day difference (a − b), rounded. Positive when `a` is later than `b`. */
export function diffDays(a: Date, b: Date): number {
	return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Clamp `n` into the inclusive [min, max] range. */
export function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function toDate(input: DateInput): Date | null {
	if (input == null) return null;
	const d = input instanceof Date ? input : new Date(input);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Appeal score 0–100 (two 50/50 sub-scores), or `null` when unscoreable.
 *
 * - earlyMoverScore: 50 at 0-day announce→reach-out delay, decays to 0 at 30 days.
 * - runwayScore: 50 when the event is 60+ days out, decays to 0 at/after the event date.
 *
 * Returns `null` (UNSCORED — distinct from 0) when `eventDate` OR `announcedAt` is missing.
 * When `firstReachedOutAt` is missing but both other dates are set, uses the delay-so-far
 * (now − announcedAt) so the score decays while a lead sits un-contacted.
 */
export function computeAppealScore(
	eventDate: DateInput,
	announcedAt: DateInput,
	firstReachedOutAt: DateInput,
	now: DateInput = new Date()
): number | null {
	const event = toDate(eventDate);
	const announced = toDate(announcedAt);
	if (!event || !announced) return null;

	const nowDate = toDate(now) ?? new Date();
	const reachedOut = toDate(firstReachedOutAt);

	const daysToReachOut = reachedOut
		? diffDays(reachedOut, announced)
		: diffDays(nowDate, announced);
	const earlyMoverScore = clamp(50 - (daysToReachOut / 30) * 50, 0, 50);

	const daysToEvent = diffDays(event, nowDate);
	const runwayScore = daysToEvent <= 0 ? 0 : clamp((daysToEvent / 60) * 50, 0, 50);

	return Math.round(earlyMoverScore + runwayScore);
}

export type AppealTier = 'high' | 'mid' | 'low' | 'none';

/** Map a score to a display tier. `null` → 'none' (unscoreable). */
export function appealTier(score: number | null): AppealTier {
	if (score == null) return 'none';
	if (score >= 67) return 'high';
	if (score >= 34) return 'mid';
	return 'low';
}
