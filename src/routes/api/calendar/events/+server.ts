/**
 * GET /api/calendar/events (NCAL-1) — session-gated read of the shared Nextcloud
 * "Veent Team" calendar.
 *
 * Flow: session gate (401 before try) → parse/validate ?start&?end (400 OUTSIDE the
 * CalDavError catch) → REPORT via reader → parse via parser → json({ success, events, count }).
 *
 * Security: a Nextcloud 401 (bad app password) is surfaced as a generic 503 — the
 * upstream status/credential is never echoed. A SvelteKit HttpError is NOT an instance
 * of CalDavError, so the `instanceof` guard re-throws the 400/401 unchanged (never 503).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCalendarReport } from '$lib/caldav/reader';
import { parseIcsToEvents } from '$lib/caldav/parser';
import { CalDavError } from '$lib/caldav/reader';

/** Current-month window `[first-of-month 00:00Z, first-of-next-month 00:00Z)`. */
function defaultMonthWindow(): { start: Date; end: Date } {
	const now = new Date();
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	return { start, end };
}

export const GET: RequestHandler = async ({ locals, url }) => {
	// Session gate BEFORE the try — HttpError(401) is never remapped to 503.
	if (!locals.user) throw error(401, 'Unauthorized');

	// Date parsing/validation OUTSIDE the CalDavError catch — an invalid date is a 400, not a 503.
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');
	let range: { start: Date; end: Date };
	if (startParam == null && endParam == null) {
		range = defaultMonthWindow();
	} else {
		const start = new Date(startParam ?? '');
		const end = new Date(endParam ?? '');
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			throw error(400, 'Invalid start/end date');
		}
		if (start.getTime() >= end.getTime()) {
			throw error(400, 'start must be before end');
		}
		range = { start, end };
	}

	try {
		const blobs = await fetchCalendarReport(range);
		const events = blobs.flatMap((b) => parseIcsToEvents(b, range));
		return json({ success: true, events, count: events.length });
	} catch (e) {
		if (e instanceof CalDavError) throw error(503, 'Calendar service unavailable');
		throw e;
	}
};
