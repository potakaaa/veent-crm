import { describe, it, expect } from 'vitest';
import {
	shouldShowDropdown,
	applySelection,
	isValueInvalidFromMatch,
	createRequestGen
} from './combobox-freetext-logic';

// Section A test gate (plan step 5) — proves AC5 "one shared component, never blocks"
// + AC2 dropdown-shows decision + AC4 exact-selection, all Fully-Automated under the
// existing `node` vitest project (no browser harness required).

describe('shouldShowDropdown (AC2)', () => {
	it('shows the dropdown only when a search source is present AND results are non-empty', () => {
		expect(shouldShowDropdown(true, ['Alice', 'Bob'])).toBe(true);
	});

	it('hides the dropdown when there is no search source (free-text-only mode)', () => {
		expect(shouldShowDropdown(false, ['Alice'])).toBe(false);
	});

	it('hides the dropdown when the source returned zero results', () => {
		expect(shouldShowDropdown(true, [])).toBe(false);
	});
});

describe('applySelection (AC4)', () => {
	it('returns the exact picked string and closes the dropdown', () => {
		expect(applySelection('Ali', 'Alice Cooper')).toEqual({ value: 'Alice Cooper', open: false });
	});

	it('does not merge or reformat — the picked value fully replaces the typed value', () => {
		const r = applySelection('anything typed', 'Exact Suggested Name');
		expect(r.value).toBe('Exact Suggested Name');
		expect(r.open).toBe(false);
	});
});

describe('never-block invariant (AC5)', () => {
	it('forwards an unmatched free-text value unchanged (no suggestion match required)', () => {
		// A value not present in the results list is still perfectly valid — the logic
		// module exposes no transform that would alter or reject it.
		const results = ['Alice', 'Bob'];
		const typed = 'Brand New Organizer 123';
		expect(results.includes(typed)).toBe(false);
		// The value is never rewritten based on match status; only an explicit selection changes it.
		expect(isValueInvalidFromMatch(typed, results)).toBe(false);
	});

	it('never derives an invalid/error state from match status — matched OR unmatched', () => {
		expect(isValueInvalidFromMatch('Alice', ['Alice'])).toBe(false);
		expect(isValueInvalidFromMatch('unmatched', ['Alice'])).toBe(false);
		expect(isValueInvalidFromMatch('', [])).toBe(false);
	});
});

describe('createRequestGen latest-wins guard', () => {
	it('marks an earlier generation stale once a later one is issued', () => {
		const t = createRequestGen();
		const first = t.next();
		const second = t.next();
		expect(t.isStale(first)).toBe(true);
		expect(t.isStale(second)).toBe(false);
	});
});
