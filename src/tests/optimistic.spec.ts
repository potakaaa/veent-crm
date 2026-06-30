import { describe, it, expect } from 'vitest';
import { removeFromList, patchInList, patchRecord, reconcile } from '$lib/utils/optimistic';

type Row = { id: string; stage: string; ownerId?: string | null };

const rows: Row[] = [
	{ id: 'a', stage: 'new' },
	{ id: 'b', stage: 'contacted' },
	{ id: 'c', stage: 'replied' }
];

describe('optimistic helpers', () => {
	it('applyOptimistic mutates the copy and leaves the original snapshot intact', () => {
		const snapshot = rows;
		const next = removeFromList(rows, 'b');

		// the returned list reflects the optimistic change
		expect(next.map((r) => r.id)).toEqual(['a', 'c']);
		// the captured snapshot (original reference) is untouched — rollback is possible
		expect(snapshot).toBe(rows);
		expect(snapshot.map((r) => r.id)).toEqual(['a', 'b', 'c']);
		expect(next).not.toBe(rows);
	});

	it('patchInList shallow-patches the matching item without mutating the input', () => {
		const next = patchInList(rows, 'a', { stage: 'won' });
		expect(next.find((r) => r.id === 'a')?.stage).toBe('won');
		// unrelated rows are preserved by reference (cheap)
		expect(next.find((r) => r.id === 'b')).toBe(rows.find((r) => r.id === 'b'));
		// original is untouched
		expect(rows.find((r) => r.id === 'a')?.stage).toBe('new');
	});

	it('patchRecord shallow-patches a single record without mutating it', () => {
		const record = { id: 'a', stage: 'new', ownerId: null as string | null };
		const next = patchRecord(record, { ownerId: 'u1' });
		expect(next.ownerId).toBe('u1');
		expect(next.stage).toBe('new');
		expect(record.ownerId).toBe(null); // original untouched
		expect(next).not.toBe(record);
	});

	it('rollback restores the captured snapshot after a failed action', () => {
		// simulate the page flow: capture snapshot, optimistically mutate, then roll back
		let shadow: Row[] = rows;
		const snapshot = shadow;
		shadow = removeFromList(shadow, 'a'); // optimistic
		expect(shadow.map((r) => r.id)).toEqual(['b', 'c']);

		shadow = snapshot; // rollback on failure
		expect(shadow).toBe(rows);
		expect(shadow.map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	it('reconcile prefers server data after invalidateAll', () => {
		const shadow: Row[] = [{ id: 'a', stage: 'won' }]; // stale optimistic value
		const server: Row[] = [
			{ id: 'a', stage: 'new' },
			{ id: 'b', stage: 'contacted' }
		];
		// after invalidateAll(), server truth wins
		expect(reconcile(shadow, server)).toBe(server);
	});
});
