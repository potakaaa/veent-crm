// Client-side Google Sheets → CSV helpers for the import wizard. The browser (NOT the server)
// fetches the user-supplied Sheets URL — server-side fetch of a user URL is forbidden (SSRF
// avoidance, see plan Decision Summary). Confirmed CORS-viable for public/published sheets by
// csv-sheets-import-ui_FEASIBILITY_07-07-26.md.

/** Thrown when a Sheets URL cannot be read as CSV (not public, deleted, or a login redirect). */
export class SheetNotAccessibleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SheetNotAccessibleError';
	}
}

export const SHEET_NOT_ACCESSIBLE_MESSAGE =
	'That Google Sheet could not be read. Make sure it is shared as "Anyone with the link can view" (or published to the web), then try again.';

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

/**
 * Extract the spreadsheet ID from any common Google Sheets URL shape (`/edit`, `/edit#gid=...`,
 * bare `/d/{id}`, `/d/{id}/edit?usp=sharing`, etc.) and build the CSV export URL. Preserves a
 * `gid` (specific tab) when present in the URL hash or query. Returns `null` for a malformed or
 * non-Sheets URL.
 */
export function buildSheetsExportUrl(sheetUrl: string): string | null {
	if (!sheetUrl || typeof sheetUrl !== 'string') return null;
	let parsed: URL;
	try {
		parsed = new URL(sheetUrl.trim());
	} catch {
		return null;
	}
	if (!/(^|\.)docs\.google\.com$/.test(parsed.hostname)) return null;

	const idMatch = SHEET_ID_RE.exec(parsed.pathname);
	if (!idMatch) return null;
	const id = idMatch[1];

	// A gid (tab id) may live in the hash (#gid=123) or the query (?gid=123).
	const gidFromHash = /gid=([0-9]+)/.exec(parsed.hash)?.[1];
	const gidFromQuery = parsed.searchParams.get('gid');
	const gid = gidFromHash ?? gidFromQuery ?? undefined;

	const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
	return gid ? `${base}&gid=${gid}` : base;
}

/**
 * Fetch a Sheets CSV-export URL from the browser and return the CSV text. Throws
 * `SheetNotAccessibleError` with a plain-language message (AC4) on a non-200 response or when the
 * response is an HTML login/redirect page rather than CSV (Google serves the sign-in page with a
 * 200 + `text/html` content-type for private sheets).
 */
export async function fetchSheetAsCsvText(url: string): Promise<string> {
	let response: Response;
	try {
		response = await fetch(url, { credentials: 'omit' });
	} catch {
		throw new SheetNotAccessibleError(SHEET_NOT_ACCESSIBLE_MESSAGE);
	}

	if (!response.ok) {
		throw new SheetNotAccessibleError(SHEET_NOT_ACCESSIBLE_MESSAGE);
	}

	const contentType = response.headers.get('content-type') ?? '';
	const text = await response.text();

	// Private sheets return the HTML sign-in page (200 + text/html) instead of CSV.
	if (contentType.includes('text/html') || /^\s*<(!doctype|html)/i.test(text)) {
		throw new SheetNotAccessibleError(SHEET_NOT_ACCESSIBLE_MESSAGE);
	}

	return text;
}
