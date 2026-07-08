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
import { createEvent, CalDavWebhookError } from '$lib/caldav/writer';
import { createCalendarEventSchema } from '$lib/zod/schemas';

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
	const MAX_RANGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // matches parser MAX_WINDOW_MS (~2 years)
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
		if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
			throw error(400, 'date range too large (max 2 years)');
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

/**
 * POST /api/calendar/events (NCAL-2) — session-gated create of a Nextcloud event via
 * the n8n webhook. The CRM never holds CalDAV write credentials.
 *
 * Flow: session gate (401, FIRST statement) → parse JSON (400 on malformed) → Zod
 * validate (400 with per-field errors, no webhook call) → generate uid + embed
 * `CRM-HREF:` in description when `leadHref` present → writer.createEvent → 200
 * `{ success, uid }`. Any writer throw maps to 502 — secret/URL/upstream never leak.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	// Session gate BEFORE any parse/validate/writer call.
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = createCalendarEventSchema.safeParse(body);
	if (!parsed.success) {
		return json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const { title, start, end, location, description, categories, leadHref } = parsed.data;
	const uid = crypto.randomUUID();
	// Embed the CRM deep-link as a CRM-HREF line prepended to the description (n8n's ICS
	// builder cannot emit the URL: property; the NCAL-1 parser reads this line back).
	const finalDescription = leadHref
		? `CRM-HREF:${leadHref}${description ? `\n${description}` : ''}`
		: description;

	try {
		await createEvent({
			uid,
			title,
			start,
			end,
			location,
			description: finalDescription,
			categories
		});
	} catch (e) {
		if (e instanceof CalDavWebhookError) throw error(502, 'Calendar service unavailable');
		throw e;
	}

	return json({ success: true, uid });
};
