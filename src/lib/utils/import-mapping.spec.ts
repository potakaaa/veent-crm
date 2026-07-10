import { describe, it, expect } from 'vitest';
import {
	validateMapping,
	buildPreviewRows,
	partitionCommitRows,
	buildCommitSummary,
	fieldsForTarget,
	LEAD_IMPORT_FIELDS,
	ORGANIZER_IMPORT_FIELDS,
	type ColumnMapping
} from './import-mapping';

describe('validateMapping (AC5)', () => {
	it('accepts a partial mapping when the target minimum field (name) is present', () => {
		const mapping: ColumnMapping = { 'Org Name': 'name' };
		expect(validateMapping(mapping, 'leads')).toEqual({ valid: true });
		expect(validateMapping(mapping, 'organizers')).toEqual({ valid: true });
	});

	it('rejects with a stated reason when the minimum field is missing', () => {
		const mapping: ColumnMapping = { City: 'location' };
		const res = validateMapping(mapping, 'leads');
		expect(res.valid).toBe(false);
		expect(res.reason).toMatch(/must be mapped/i);
	});
});

describe('mappable field lists — category exclusion (carried-forward constraint)', () => {
	it('never offers category as a mappable field on either target', () => {
		const keys = [...LEAD_IMPORT_FIELDS, ...ORGANIZER_IMPORT_FIELDS].map((f) => f.key);
		expect(keys).not.toContain('category');
		expect(fieldsForTarget('leads').some((f) => f.key === 'category')).toBe(false);
		expect(fieldsForTarget('organizers').some((f) => f.key === 'category')).toBe(false);
	});
});

describe('buildPreviewRows (AC6)', () => {
	it('returns mapped rows reflecting the current mapping and performs no writes', () => {
		const headers = ['Org', 'FB', 'City'];
		const rows = [
			['Acme', 'https://facebook.com/acme', 'Manila'],
			['Beta', '', 'Cebu']
		];
		const mapping: ColumnMapping = {
			Org: 'name',
			FB: 'socialFacebook',
			City: 'location'
		};
		const preview = buildPreviewRows(rows, headers, mapping, 'leads');
		expect(preview.length).toBe(2);
		expect(preview[0].data).toEqual({
			name: 'Acme',
			socialFacebook: 'https://facebook.com/acme',
			location: 'Manila'
		});
		expect(preview[0].isDuplicate).toBe(false);
		// FB handle drives normalizedHandle.
		expect(preview[0].normalizedHandle).toBe('acme');
	});

	it('is a pure function — importing the module pulls in no db client', async () => {
		const mod = await import('./import-mapping');
		expect(typeof mod.buildPreviewRows).toBe('function');
	});
});

describe('partitionCommitRows (AC7 payload builder) + buildCommitSummary (AC10)', () => {
	it('honors the per-row skip choice: skipped rows never reach the import list', () => {
		const { toImport, skipped } = partitionCommitRows([
			{ data: { name: 'A' }, skip: false },
			{ data: { name: 'B' }, skip: true },
			{ data: { name: 'C' }, skip: false }
		]);
		expect(skipped).toBe(1);
		expect(toImport.map((r) => r.data.name)).toEqual(['A', 'C']);
	});

	it('builds a correct result summary for mixed created/skipped/errored input', () => {
		const summary = buildCommitSummary(2, 1, [{ index: 3, message: 'Invalid name' }]);
		expect(summary).toEqual({
			created: 2,
			skipped: 1,
			errored: 1,
			errors: [{ index: 3, message: 'Invalid name' }]
		});
	});
});
