import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncer, DEFAULT_DEBOUNCE_MS } from '$lib/components/ui/search-input/search-input';

// ---------------------------------------------------------------------------
// unified-filter-components — SearchInput debounce factory (AC1/AC2).
// Pure-logic proof via fake timers (no component render needed).
// ---------------------------------------------------------------------------

describe('createDebouncer (AC1/AC2)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('defaults to the canonical 300ms', () => {
		expect(DEFAULT_DEBOUNCE_MS).toBe(300);
	});

	it('fires the callback once, 300ms after the last call (default delay)', () => {
		const cb = vi.fn();
		const debounced = createDebouncer(cb);
		debounced('a');
		expect(cb).not.toHaveBeenCalled();
		vi.advanceTimersByTime(299);
		expect(cb).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith('a');
	});

	it('resets the timer on each call — only the final value fires', () => {
		const cb = vi.fn();
		const debounced = createDebouncer(cb, 300);
		debounced('a');
		vi.advanceTimersByTime(200);
		debounced('ab');
		vi.advanceTimersByTime(200);
		debounced('abc');
		vi.advanceTimersByTime(300);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith('abc');
	});

	it('honors a custom debounce delay', () => {
		const cb = vi.fn();
		const debounced = createDebouncer(cb, 50);
		debounced('x');
		vi.advanceTimersByTime(50);
		expect(cb).toHaveBeenCalledTimes(1);
	});
});
