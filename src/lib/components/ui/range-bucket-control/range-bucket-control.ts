/**
 * Shared range-bucket-control logic — manager dashboard (GitHub #244 / DASH-1).
 *
 * Pure, framework-free helpers (no Svelte imports) so bucket validation and ARIA
 * derivation stay unit-testable in this repo's node-only vitest project. Mirrors the
 * `week-range-control.ts` precedent, but for a fixed 3-way enum rather than numeric
 * presets + null.
 */

export const RANGE_BUCKETS = ['week', 'month', 'year', 'all'] as const;
export type RangeBucket = (typeof RANGE_BUCKETS)[number];

/** Type guard: is the raw string one of the four known buckets? */
export function isValidRangeBucket(v: string): v is RangeBucket {
	return (RANGE_BUCKETS as readonly string[]).includes(v);
}

/** True when a bucket button should render `aria-pressed="true"`. */
export function computeAriaPressed(bucket: RangeBucket, active: RangeBucket): boolean {
	return bucket === active;
}
