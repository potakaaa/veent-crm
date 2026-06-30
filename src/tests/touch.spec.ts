/**
 * Unit tests for touch-logging helpers (no DB required).
 *
 *   T-U1: followUpDate computes YYYY-MM-DD in Asia/Manila (UTC+8)
 *   T-U2: ACTIVITY_CHANNELS covers every label shown in LogTouchForm
 *   T-U3: ACTIVITY_OUTCOMES covers every value shown in LogTouchForm
 */
import { describe, it, expect } from 'vitest';
import { followUpDate } from '$lib/utils/dates';
import { ACTIVITY_CHANNELS, ACTIVITY_OUTCOMES } from '$lib/zod/schemas';

// ---------------------------------------------------------------------------
// T-U1 — followUpDate
// ---------------------------------------------------------------------------

describe('followUpDate (T-U1)', () => {
	// Fix "now" to 2026-06-30T00:00:00Z = 2026-06-30 08:00 Manila → Manila date is Jun 30.
	const base = new Date('2026-06-30T00:00:00.000Z');

	it('1d from base Manila date returns next day', () => {
		expect(followUpDate(1, base)).toBe('2026-07-01');
	});

	it('3d returns 3 days ahead', () => {
		expect(followUpDate(3, base)).toBe('2026-07-03');
	});

	it('7d returns 7 days ahead', () => {
		expect(followUpDate(7, base)).toBe('2026-07-07');
	});

	it('14d returns 14 days ahead', () => {
		expect(followUpDate(14, base)).toBe('2026-07-14');
	});

	it('handles month boundary correctly', () => {
		// 2026-06-29 08:00 Manila → Jun 29. +3 days → Jul 2.
		const near = new Date('2026-06-29T00:00:00.000Z');
		expect(followUpDate(3, near)).toBe('2026-07-02');
	});

	it('handles year boundary correctly', () => {
		// 2026-12-31 00:00Z = 2026-12-31 08:00 Manila → Dec 31. +1 → Jan 1 2027.
		const eoy = new Date('2026-12-31T00:00:00.000Z');
		expect(followUpDate(1, eoy)).toBe('2027-01-01');
	});

	it('UTC midnight (Manila 8am) picks Manila date not prior UTC date', () => {
		// 2026-07-01T00:00:00Z = Manila 08:00 Jul 1.
		// Manila date is Jul 1, so +1 should yield Jul 2.
		const midnight = new Date('2026-07-01T00:00:00.000Z');
		expect(followUpDate(1, midnight)).toBe('2026-07-02');
	});

	it('UTC 16:00 (Manila midnight = next calendar day) picks the Manila-next-day', () => {
		// 2026-06-30T16:00:00Z = 2026-07-01 00:00 Manila → Manila date is Jul 1.
		// +1 → Jul 2.
		const manilaNewDay = new Date('2026-06-30T16:00:00.000Z');
		expect(followUpDate(1, manilaNewDay)).toBe('2026-07-02');
	});
});

// ---------------------------------------------------------------------------
// T-U2 & T-U3 — enum coverage (UI labels map to valid DB enum values)
// ---------------------------------------------------------------------------

describe('ACTIVITY_CHANNELS enum coverage (T-U2)', () => {
	// These are the channel keys the LogTouchForm renders as buttons.
	const uiChannels = ['fb_dm', 'fb_comment', 'ig_dm', 'email', 'call', 'meeting', 'other'];

	it('every UI channel key exists in ACTIVITY_CHANNELS', () => {
		for (const ch of uiChannels) {
			expect(ACTIVITY_CHANNELS).toContain(ch);
		}
	});

	it('ACTIVITY_CHANNELS contains no unexpected extra values', () => {
		expect(ACTIVITY_CHANNELS).toHaveLength(uiChannels.length);
	});
});

describe('ACTIVITY_OUTCOMES enum coverage (T-U3)', () => {
	// Keys used in LogTouchForm outcomeOpts.
	const uiOutcomes = ['sent', 'replied', 'no_response', 'rejected'];

	it('every UI outcome key is a valid ACTIVITY_OUTCOMES value', () => {
		for (const o of uiOutcomes) {
			expect(ACTIVITY_OUTCOMES).toContain(o);
		}
	});
});
