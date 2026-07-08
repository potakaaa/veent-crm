/**
 * CalDAV read client (NCAL-1). SERVER-ONLY.
 *
 * Issues a WebDAV `REPORT calendar-query` against the shared Nextcloud "Veent Team"
 * calendar and extracts each returned `.ics` blob from the 207 multistatus body.
 *
 * Security posture:
 *  - The `time-range` filter is formatted from parsed `Date` objects, NEVER from raw
 *    query strings — this prevents XML injection into the calendar-query body.
 *  - Any upstream non-2xx (including 401 from a bad app password) is mapped to a typed
 *    `CalDavError` carrying a CLIENT-SAFE message only — the upstream status code and
 *    credentials never appear in the thrown message.
 */
import { XMLParser } from 'fast-xml-parser';
import { calendarCollectionUrl, basicAuthHeader } from './constants';

/**
 * Typed CalDAV error. Carries an internal `upstreamStatus` for server-side logging
 * discipline, but its `message` is always client-safe (no credential, no upstream
 * status code, no server detail).
 */
export class CalDavError extends Error {
	/** Internal upstream HTTP status (server-side only — never rendered to a client). */
	readonly upstreamStatus?: number;

	constructor(message: string, upstreamStatus?: number) {
		super(message);
		this.name = 'CalDavError';
		this.upstreamStatus = upstreamStatus;
	}
}

/** Formats a Date to CalDAV UTC `YYYYMMDDTHHMMSSZ` (from the Date, never a raw string). */
function toCalDavUtc(date: Date): string {
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return (
		`${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
		`T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
	);
}

/**
 * Builds the `calendar-query` REPORT XML body with a `c:time-range` filter.
 * Both bounds are derived from the `start`/`end` Date args via {@link toCalDavUtc} —
 * raw request strings can never reach this body.
 */
export function buildReportBody(start: Date, end: Date): string {
	return (
		`<?xml version="1.0" encoding="utf-8" ?>` +
		`<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
		`<d:prop><d:getetag /><c:calendar-data /></d:prop>` +
		`<c:filter><c:comp-filter name="VCALENDAR">` +
		`<c:comp-filter name="VEVENT">` +
		`<c:time-range start="${toCalDavUtc(start)}" end="${toCalDavUtc(end)}" />` +
		`</c:comp-filter></c:comp-filter></c:filter>` +
		`</c:calendar-query>`
	);
}

/** Recursively collects every `calendar-data` string value from the parsed multistatus tree. */
function collectCalendarData(node: unknown, out: string[]): void {
	if (node == null) return;
	if (Array.isArray(node)) {
		for (const item of node) collectCalendarData(item, out);
		return;
	}
	if (typeof node === 'object') {
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			if (key === 'calendar-data') {
				if (Array.isArray(value)) {
					for (const v of value) if (typeof v === 'string' && v.trim()) out.push(v);
				} else if (typeof value === 'string' && value.trim()) {
					out.push(value);
				} else if (value && typeof value === 'object') {
					// e.g. { '#text': '...' } when the element carries attributes
					const text = (value as Record<string, unknown>)['#text'];
					if (typeof text === 'string' && text.trim()) out.push(text);
				}
			} else {
				collectCalendarData(value, out);
			}
		}
	}
}

/**
 * Extracts each `<c:calendar-data>` `.ics` payload from a 207 multistatus body.
 * Namespace prefixes are stripped so extraction works regardless of the server's
 * chosen prefixes (`c:`, `cal:`, etc.).
 */
export function extractCalendarData(multistatusXml: string): string[] {
	const parser = new XMLParser({
		removeNSPrefix: true,
		ignoreAttributes: true,
		trimValues: true
	});
	const parsed = parser.parse(multistatusXml);
	const out: string[] = [];
	collectCalendarData(parsed, out);
	return out;
}

/**
 * Sends the REPORT request and returns the extracted `.ics` blobs.
 * Throws {@link CalDavError} (client-safe message) on any non-2xx response.
 */
export async function fetchCalendarReport({
	start,
	end
}: {
	start: Date;
	end: Date;
}): Promise<string[]> {
	const url = calendarCollectionUrl();
	const auth = basicAuthHeader();

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'REPORT',
			headers: {
				Authorization: auth,
				Depth: '1',
				'Content-Type': 'application/xml; charset=utf-8'
			},
			body: buildReportBody(start, end)
		});
	} catch {
		// Network/DNS/TLS failure — never surface the underlying detail.
		throw new CalDavError('Calendar service unavailable');
	}

	if (!res.ok) {
		throw new CalDavError('Calendar service unavailable', res.status);
	}

	const body = await res.text();
	return extractCalendarData(body);
}
