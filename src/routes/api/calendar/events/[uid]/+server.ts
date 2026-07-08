/**
 * PUT / DELETE /api/calendar/events/[uid] (NCAL-2) — session-gated update/delete of a
 * Nextcloud event via the n8n webhooks. The CRM never holds CalDAV write credentials.
 *
 * Security: the session gate (401) is the FIRST statement in both handlers, before any
 * parse/validate/writer call. Any writer throw maps to 502 — the shared secret, webhook
 * URL, and upstream n8n status/body never appear in a client-visible response.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateEvent, deleteEvent, CalDavWebhookError } from '$lib/caldav/writer';
import { updateCalendarEventSchema } from '$lib/zod/schemas';

export const PUT: RequestHandler = async ({ locals, request, params }) => {
	// Session gate BEFORE any parse/validate/writer call.
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = updateCalendarEventSchema.safeParse(body);
	if (!parsed.success) {
		return json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const { title, start, end, location, description, categories, leadHref } = parsed.data;
	// Mirror POST: embed the CRM deep-link as a prepended CRM-HREF line in the description.
	const finalDescription = leadHref
		? `CRM-HREF:${leadHref}${description ? `\n${description}` : ''}`
		: description;

	try {
		await updateEvent(params.uid, {
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

	return json({ success: true, uid: params.uid });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	// Session gate BEFORE any writer call.
	if (!locals.user) throw error(401, 'Unauthorized');

	try {
		await deleteEvent(params.uid);
	} catch (e) {
		if (e instanceof CalDavWebhookError) throw error(502, 'Calendar service unavailable');
		throw e;
	}

	return json({ success: true });
};
