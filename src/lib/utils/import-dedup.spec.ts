import { describe, it, expect } from 'vitest';
import { flagDuplicates } from './import-dedup';
import type { PreviewRow } from './import-mapping';

function row(partial: Partial<PreviewRow> & { index: number }): PreviewRow {
	return {
		data: {},
		normalizedHandle: null,
		sourceRef: null,
		isDuplicate: false,
		...partial
	};
}

describe('flagDuplicates (AC7)', () => {
	it('flags exact and case-insensitive normalizedHandle matches', () => {
		const existingHandles = new Set(['acme']);
		const existingSourceRefs = new Set<string>();
		const rows = [
			row({ index: 0, normalizedHandle: 'acme' }),
			row({ index: 1, normalizedHandle: 'ACME' }),
			row({ index: 2, normalizedHandle: 'unique' })
		];
		const flagged = flagDuplicates(rows, existingHandles, existingSourceRefs);
		expect(flagged[0].isDuplicate).toBe(true);
		expect(flagged[0].duplicateReason).toBe('normalizedHandle');
		expect(flagged[1].isDuplicate).toBe(true);
		expect(flagged[2].isDuplicate).toBe(false);
	});

	it('flags sourceRef matches with priority over handle', () => {
		const flagged = flagDuplicates(
			[row({ index: 0, normalizedHandle: 'brand-new', sourceRef: 'evt-123' })],
			new Set(),
			new Set(['evt-123'])
		);
		expect(flagged[0].isDuplicate).toBe(true);
		expect(flagged[0].duplicateReason).toBe('sourceRef');
	});

	it('does not mutate the input rows', () => {
		const input = [row({ index: 0, normalizedHandle: 'acme' })];
		flagDuplicates(input, new Set(['acme']), new Set());
		expect(input[0].isDuplicate).toBe(false);
	});
});
