import { describe, it, expect } from 'vitest';
import {
	toggleOption,
	optionValue,
	optionLabel,
	singleTriggerLabel
} from '$lib/components/ui/filter-dropdown/filter-dropdown';

// ---------------------------------------------------------------------------
// unified-filter-components — FilterDropdown selection branch (AC3/AC4/AC5).
//
// Pure-logic proof (no component render — repo has no jsdom vitest project).
// toggleOption is the single branch point between multi-select toggle-and-stay
// and single-select select-and-close cardinality.
// ---------------------------------------------------------------------------

describe('toggleOption — multi-select (AC3/AC5)', () => {
	it('adds a value when absent (toggle-and-stay-open)', () => {
		expect(toggleOption(true, [], 'PH')).toEqual(['PH']);
		expect(toggleOption(true, ['PH'], 'US')).toEqual(['PH', 'US']);
	});

	it('removes a value when already present', () => {
		expect(toggleOption(true, ['PH', 'US'], 'PH')).toEqual(['US']);
	});

	it('holds 2+ simultaneous active values across repeated calls (Up for Grabs Country/Category)', () => {
		let sel: string[] | string = [];
		sel = toggleOption(true, sel, 'Concert');
		sel = toggleOption(true, sel, 'Festival');
		sel = toggleOption(true, sel, 'Sports');
		expect(sel).toEqual(['Concert', 'Festival', 'Sports']);
		expect((sel as string[]).length).toBe(3);
	});
});

describe('toggleOption — single-select (AC3/AC4 cardinality regression guard)', () => {
	it('replaces (never appends) — always exactly 1 active value', () => {
		expect(toggleOption(false, '', 'contacted')).toBe('contacted');
		expect(toggleOption(false, 'contacted', 'qualified')).toBe('qualified');
	});

	it('holds exactly 1 active value across 3+ repeated calls with different values', () => {
		// My Leads Stage/Platform/Country: selecting a new value must replace, never accumulate.
		let sel: string[] | string = '';
		for (const v of ['contacted', 'qualified', 'proposal', 'won']) {
			sel = toggleOption(false, sel, v);
			expect(Array.isArray(sel)).toBe(false);
			expect(sel).toBe(v);
		}
		expect(sel).toBe('won');
	});

	it('never yields an array in single-select mode', () => {
		const out = toggleOption(false, ['stale-array-shape'], 'fresh');
		expect(out).toBe('fresh');
	});
});

describe('option value/label helpers (value≠label support)', () => {
	it('reads bare-string options as value===label', () => {
		expect(optionValue('PH')).toBe('PH');
		expect(optionLabel('PH')).toBe('PH');
	});

	it('reads {value,label} options distinctly (Stage key vs label, rep id vs name)', () => {
		const opt = { value: 'contacted', label: 'Contacted' };
		expect(optionValue(opt)).toBe('contacted');
		expect(optionLabel(opt)).toBe('Contacted');
	});

	it('derives the single-select trigger label from the active value', () => {
		const opts = [
			{ value: 'contacted', label: 'Contacted' },
			{ value: 'won', label: 'Won' }
		];
		expect(singleTriggerLabel('Stage', opts, '')).toBe('Stage');
		expect(singleTriggerLabel('Stage', opts, 'won')).toBe('Won');
		expect(singleTriggerLabel('Stage', opts, 'unknown')).toBe('Stage');
	});
});
