import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	buildSheetsExportUrl,
	fetchSheetAsCsvText,
	SheetNotAccessibleError,
	SHEET_NOT_ACCESSIBLE_MESSAGE
} from './import-sheets-fetch';
import { parseCsvText } from './import-parse';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('buildSheetsExportUrl (PVL supplement — URL-parse correctness)', () => {
	it('returns null for malformed / non-Sheets URLs', () => {
		expect(buildSheetsExportUrl('')).toBeNull();
		expect(buildSheetsExportUrl('not a url')).toBeNull();
		expect(buildSheetsExportUrl('https://example.com/spreadsheets/d/abc')).toBeNull();
		expect(buildSheetsExportUrl('https://docs.google.com/document/d/abc/edit')).toBeNull();
	});

	it('builds the export CSV URL for common valid Sheets URL shapes', () => {
		expect(buildSheetsExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit')).toBe(
			'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv'
		);

		expect(buildSheetsExportUrl('https://docs.google.com/spreadsheets/d/ABC123')).toBe(
			'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv'
		);

		expect(
			buildSheetsExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit?usp=sharing')
		).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv');
	});

	it('preserves the gid (tab) from the hash or query', () => {
		expect(buildSheetsExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=99')).toBe(
			'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=99'
		);
	});
});

describe('fetchSheetAsCsvText (AC3)', () => {
	it('reaches the same row-parse path as a file upload for a canned CSV response', async () => {
		const csv = 'name,location\nAcme,Manila\n';
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } }))
		);

		const text = await fetchSheetAsCsvText('https://docs.google.com/x/export?format=csv');
		const parsed = parseCsvText(text);
		expect(parsed.headers).toEqual(['name', 'location']);
		expect(parsed.rows).toEqual([['Acme', 'Manila']]);
	});
});

describe('fetchSheetAsCsvText (AC4)', () => {
	it('throws the plain-language error on a non-200 response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 404 }))
		);
		await expect(
			fetchSheetAsCsvText('https://docs.google.com/x/export?format=csv')
		).rejects.toThrowError(SheetNotAccessibleError);
	});

	it('throws the plain-language error when Google returns the HTML login page (200 + text/html)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('<!DOCTYPE html><html><body>Sign in</body></html>', {
						status: 200,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					})
			)
		);
		await expect(
			fetchSheetAsCsvText('https://docs.google.com/x/export?format=csv')
		).rejects.toThrowError(SHEET_NOT_ACCESSIBLE_MESSAGE);
	});
});
