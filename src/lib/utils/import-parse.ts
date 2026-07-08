// Pure CSV-text-to-rows parser for the import wizard. NO SvelteKit ($lib/$env) or DB imports so
// it is trivially unit-testable in the node vitest project (mirrors the import-utils.ts isolation
// convention). RFC-4180-ish: quoted fields, commas-in-quotes, escaped double-quotes (""), CRLF or
// LF line endings, and a leading UTF-8 BOM are all handled.

export interface ParsedCsv {
	headers: string[];
	rows: string[][];
}

/**
 * Parse CSV text into a header row plus data rows.
 *
 * - Strips a leading UTF-8 BOM (U+FEFF) if present.
 * - Fields may be wrapped in double quotes; inside a quoted field, `""` is a literal quote and
 *   commas / newlines are treated as data, not delimiters.
 * - Accepts both `\r\n` and `\n` line endings (a bare `\r` is also treated as a line break).
 * - A trailing newline does not produce a spurious empty final row.
 * - Fully-blank lines (outside quotes) are skipped.
 *
 * The first non-empty parsed record becomes `headers`; the remainder become `rows`. Every data row
 * is padded/truncated to the header length so callers can index by column position safely.
 */
export function parseCsvText(text: string): ParsedCsv {
	const records: string[][] = [];
	let field = '';
	let record: string[] = [];
	let inQuotes = false;
	let recordHasContent = false;

	// Strip a leading BOM.
	const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	const pushField = () => {
		record.push(field);
		field = '';
	};
	const pushRecord = () => {
		pushField();
		// Skip a record that is entirely empty (a single blank field with no other content).
		if (recordHasContent || record.length > 1) {
			records.push(record);
		}
		record = [];
		recordHasContent = false;
	};

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++; // consume the escaped quote
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
				recordHasContent = true;
			}
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
			recordHasContent = true;
			continue;
		}
		if (ch === ',') {
			pushField();
			continue;
		}
		if (ch === '\r') {
			// Treat \r or \r\n as one line break.
			pushRecord();
			if (input[i + 1] === '\n') i++;
			continue;
		}
		if (ch === '\n') {
			pushRecord();
			continue;
		}
		field += ch;
		if (ch.trim() !== '') recordHasContent = true;
	}

	// Flush the final field/record if the file did not end with a newline.
	if (field !== '' || record.length > 0 || recordHasContent) {
		pushRecord();
	}

	if (records.length === 0) {
		return { headers: [], rows: [] };
	}

	const headers = records[0].map((h) => h.trim());
	const width = headers.length;
	const rows = records.slice(1).map((r) => {
		const normalized = r.slice(0, width);
		while (normalized.length < width) normalized.push('');
		return normalized;
	});

	return { headers, rows };
}
