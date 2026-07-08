import { describe, it, expect } from 'vitest';
import { parseCsvText } from './import-parse';

describe('parseCsvText (AC2)', () => {
	it('splits header + data rows from a sample CSV with quoted fields, commas-in-quotes, CRLF, and BOM', () => {
		const csv =
			'﻿name,location,notes\r\n' +
			'"Acme, Inc.",Manila,"Line one""quoted"""\r\n' +
			'Beta Events,Cebu,simple\r\n';
		const { headers, rows } = parseCsvText(csv);

		expect(headers).toEqual(['name', 'location', 'notes']);
		expect(rows.length).toBe(2);
		// Comma inside quotes stays one field.
		expect(rows[0]).toEqual(['Acme, Inc.', 'Manila', 'Line one"quoted"']);
		expect(rows[1]).toEqual(['Beta Events', 'Cebu', 'simple']);
	});

	it('handles LF-only line endings and pads short rows to header width', () => {
		const csv = 'a,b,c\n1,2\n';
		const { headers, rows } = parseCsvText(csv);
		expect(headers).toEqual(['a', 'b', 'c']);
		expect(rows).toEqual([['1', '2', '']]);
	});

	it('does not emit a spurious trailing empty row and skips blank lines', () => {
		const csv = 'h1,h2\nx,y\n\nz,w\n';
		const { rows } = parseCsvText(csv);
		expect(rows).toEqual([
			['x', 'y'],
			['z', 'w']
		]);
	});

	it('returns empty headers/rows for empty input', () => {
		expect(parseCsvText('')).toEqual({ headers: [], rows: [] });
	});
});
