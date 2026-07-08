import { describe, it, expect } from 'vitest';
import {
	computeAriaPressed,
	isAllActive
} from '$lib/components/ui/week-range-control/week-range-control';

// ---------------------------------------------------------------------------
// unified-filter-components — WeekRangeControl aria-pressed logic (AC6).
// Pure-logic proof; real keyboard/focus behavior stays an Agent-Probe manual
// check (needs a rendered component, which this repo cannot do).
// ---------------------------------------------------------------------------

describe('computeAriaPressed (AC6)', () => {
	it('presses only the preset matching the active value', () => {
		expect(computeAriaPressed(4, 4)).toBe(true);
		expect(computeAriaPressed(8, 4)).toBe(false);
		expect(computeAriaPressed(12, 4)).toBe(false);
	});

	it('presses no preset when "All" is active (value === null)', () => {
		expect(computeAriaPressed(4, null)).toBe(false);
		expect(computeAriaPressed(8, null)).toBe(false);
	});

	it('presses at most one preset across the whole set', () => {
		const presets = [4, 8, 12];
		const pressed = presets.filter((p) => computeAriaPressed(p, 8));
		expect(pressed).toEqual([8]);
	});
});

describe('isAllActive (AC6)', () => {
	it('is true only when value is null', () => {
		expect(isAllActive(null)).toBe(true);
		expect(isAllActive(8)).toBe(false);
		expect(isAllActive(0)).toBe(false);
	});
});
