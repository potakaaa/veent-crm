/**
 * CalDAV write client (NCAL-2). SERVER-ONLY.
 *
 * The CRM never holds CalDAV write credentials. Instead it POSTs event payloads to
 * n8n webhooks (authenticated with a shared secret); n8n performs the actual CalDAV
 * PUT/DELETE against the shared Nextcloud "Veent Team" calendar.
 *
 * Security posture (mirrors `reader.ts`):
 *  - The shared secret and webhook URLs are read from `$env/dynamic/private` and are
 *    NEVER attached to a thrown error, logged, or returned to the client.
 *  - Any network failure or upstream non-2xx is mapped to a typed `CalDavWebhookError`
 *    carrying a CLIENT-SAFE message only — the upstream status/body/credentials never
 *    appear in the thrown message. The internal `upstreamStatus` is for server-side
 *    logging discipline only.
 */
import { n8nCalendarWebhookUrl, n8nCalendarDeleteWebhookUrl, n8nWebhookSecret } from './constants';

/**
 * Typed CalDAV write error. Its `message` is always client-safe (no secret, no webhook
 * URL, no upstream status code, no upstream body). Carries an internal `upstreamStatus`
 * for server-side logging only — never rendered to a client.
 */
export class CalDavWebhookError extends Error {
	/** Internal upstream HTTP status (server-side only — never rendered to a client). */
	readonly upstreamStatus?: number;

	constructor(message: string, upstreamStatus?: number) {
		super(message);
		this.name = 'CalDavWebhookError';
		this.upstreamStatus = upstreamStatus;
	}
}

/** Client-safe error message — the ONLY string ever surfaced from a write failure. */
const CLIENT_SAFE_MESSAGE = 'Calendar service unavailable';

/**
 * POSTs a JSON body to an n8n webhook with the shared secret header.
 * Throws {@link CalDavWebhookError} (client-safe message) on network failure or non-2xx.
 * NEVER includes the secret, URL, or upstream body in the thrown error.
 */
async function postWebhook(
	url: string | undefined,
	secret: string | undefined,
	body: unknown
): Promise<void> {
	if (!url || !secret) {
		// Missing env wiring — fail closed with the generic client-safe message.
		throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE);
	}

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-webhook-secret': secret
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		// Network/DNS/TLS failure — never surface the underlying detail.
		throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE);
	}

	if (!res.ok) {
		throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE, res.status);
	}
}

/** Event payload sent to the n8n create/update webhook. */
export interface CalendarEventPayload {
	uid: string;
	title: string;
	/** ISO 8601 UTC start — converted to Manila local date/time before sending to n8n. */
	start: string;
	/** ISO 8601 UTC end — converted to Manila local HH:MM before sending to n8n. */
	end: string;
	location?: string;
	description?: string;
	categories?: string;
}

/**
 * Converts a UTC ISO 8601 string to Manila local date and time components.
 * Manila is UTC+8 with no DST — fixed offset applied via arithmetic.
 * n8n's "Parse Input" node expects Manila-local values and writes DTSTART;TZID=Asia/Manila.
 */
function toManilaDateTime(iso: string): { date: string; time: string } {
	const utcMs = new Date(iso).getTime();
	const manilaMs = utcMs + 8 * 60 * 60 * 1000;
	const m = new Date(manilaMs);
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}`;
	const time = `${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
	return { date, time };
}

/** Builds the n8n webhook body from a CalendarEventPayload (UTC → Manila conversion). */
function toN8nBody(payload: CalendarEventPayload): Record<string, unknown> {
	const { date, time: startTime } = toManilaDateTime(payload.start);
	const { time: endTime } = toManilaDateTime(payload.end);
	return {
		uid: payload.uid,
		title: payload.title,
		date,
		startTime,
		endTime,
		...(payload.description !== undefined && { description: payload.description }),
		...(payload.location !== undefined && { location: payload.location }),
		...(payload.categories !== undefined && { categories: payload.categories })
	};
}

/**
 * Builds the final event description with a trusted `CRM-HREF:` line prepended.
 *
 * Strips any `CRM-HREF:` lines already present in the user-supplied description first
 * to prevent callers from injecting a fake deep-link when `leadHref` is absent.
 * When `leadHref` is present, prepends `CRM-HREF:${leadHref}` so the NCAL-1 parser
 * can surface the link as `event.url` without the route handlers needing to know the
 * exact format.
 */
export function embedCrmHref(
	leadHref: string | undefined,
	description: string | undefined
): string | undefined {
	const sanitized =
		description != null
			? description
					.split('\n')
					.filter((l) => !/^CRM-HREF:/i.test(l.trim()))
					.join('\n')
					.trim() || undefined
			: undefined;
	return leadHref ? `CRM-HREF:${leadHref}${sanitized ? `\n${sanitized}` : ''}` : sanitized;
}

/**
 * Creates an event via the n8n create/update webhook. The caller supplies `uid`
 * (`crypto.randomUUID()` in the route); it is returned on 2xx.
 */
export async function createEvent(payload: CalendarEventPayload): Promise<{ uid: string }> {
	await postWebhook(n8nCalendarWebhookUrl(), n8nWebhookSecret(), toN8nBody(payload));
	return { uid: payload.uid };
}

/**
 * Updates an existing event via the n8n create/update webhook. `uid` identifies the
 * event to replace; the same webhook handles create and update (upsert by UID).
 */
export async function updateEvent(
	uid: string,
	payload: Omit<CalendarEventPayload, 'uid'>
): Promise<void> {
	await postWebhook(n8nCalendarWebhookUrl(), n8nWebhookSecret(), toN8nBody({ uid, ...payload }));
}

/** Deletes an event via the n8n delete webhook (POSTs `{ uid }`). */
export async function deleteEvent(uid: string): Promise<void> {
	await postWebhook(n8nCalendarDeleteWebhookUrl(), n8nWebhookSecret(), { uid });
}
