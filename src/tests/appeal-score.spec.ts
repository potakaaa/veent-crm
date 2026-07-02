import { describe, it, expect } from 'vitest';
import { computeAppealScore, appealTier } from '$lib/appeal-score';

// Fixed "now" so every case is deterministic.
const NOW = '2026-06-01T00:00:00Z';

describe('computeAppealScore', () => {
	it('both-max dates → 100 (0-day delay + 60+ days runway)', () => {
		// announced == reached out (0-day delay → earlyMover 50);
		// event 122 days out (>60 → runway clamped to 50).
		const score = computeAppealScore('2026-10-01', '2026-06-01', '2026-06-01', NOW);
		expect(score).toBe(100);
		expect(appealTier(score)).toBe('high');
	});

	it('near-event → low (runwayScore → 0 as event approaches)', () => {
		// event 2 days out (runway ~2) + 44-day reach-out delay (earlyMover clamped to 0).
		const score = computeAppealScore('2026-06-03', '2026-04-01', '2026-05-15', NOW);
		expect(score).not.toBeNull();
		expect(score!).toBeLessThanOrEqual(33);
		expect(appealTier(score)).toBe('low');
	});

	it('long reach-out delay → low (earlyMoverScore → 0)', () => {
		// 40-day announce→reach-out delay (earlyMover clamped to 0) + event only 14 days out.
		const score = computeAppealScore('2026-06-15', '2026-01-01', '2026-02-10', NOW);
		expect(score).not.toBeNull();
		expect(score!).toBeLessThanOrEqual(33);
		expect(appealTier(score)).toBe('low');
	});

	it('missing eventDate or announcedAt → null (unscored, not 0)', () => {
		expect(computeAppealScore(null, '2026-06-01', '2026-06-01', NOW)).toBeNull();
		expect(computeAppealScore('2026-10-01', null, '2026-06-01', NOW)).toBeNull();
		expect(computeAppealScore(null, null, null, NOW)).toBeNull();
		expect(appealTier(null)).toBe('none');
	});

	it('firstReachedOutAt null but other dates set → scores via delay-so-far', () => {
		// announced 12 days ago, not yet reached out → earlyMover uses now−announced (12d delay):
		// 50 − (12/30)*50 = 30; event 122 days out → runway 50; total 80.
		const score = computeAppealScore('2026-10-01', '2026-05-20', null, NOW);
		expect(score).toBe(80);
	});

	it('boundaries: 30-day delay → earlyMover 0, 60-day runway → runway 50, past event → runway 0', () => {
		// exactly 30-day delay → earlyMover 0; event 60 days out → runway 50 → total 50.
		expect(computeAppealScore('2026-07-31', '2026-01-01', '2026-01-31', NOW)).toBe(50);
		// exactly 60-day runway → runway 50; 0-day delay → earlyMover 50 → total 100.
		expect(computeAppealScore('2026-07-31', '2026-06-01', '2026-06-01', NOW)).toBe(100);
		// event in the past → runway 0; 0-day delay → earlyMover 50 → total 50.
		expect(computeAppealScore('2026-05-01', '2026-06-01', '2026-06-01', NOW)).toBe(50);
	});
});
