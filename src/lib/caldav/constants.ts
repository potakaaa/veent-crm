/**
 * CalDAV connection constants + credential helpers (NCAL-1).
 *
 * SERVER-ONLY. This module reads `$env/dynamic/private` and builds a Basic Auth
 * header from the Nextcloud app password — it must NEVER be imported from client
 * code. Credentials never leave the server; only the built request headers are used
 * inside `reader.ts`.
 */
import { env } from '$env/dynamic/private';

/**
 * Absolute URL of the shared "Veent Team" calendar collection.
 *
 * `NEXTCLOUD_URL` already includes the scheme (e.g. `https://team.veent.io`) — do NOT
 * prepend another. `NEXTCLOUD_CALENDAR_SLUG` is pre-encoded — do NOT `encodeURIComponent`.
 */
export function calendarCollectionUrl(): string {
	return `${env.NEXTCLOUD_URL}/remote.php/dav/calendars/${env.NEXTCLOUD_USER}/${env.NEXTCLOUD_CALENDAR_SLUG}/`;
}

/**
 * Basic Auth header value for the Nextcloud CalDAV endpoint.
 * `Buffer` is a Node global (available in the Vercel nodejs22.x runtime).
 */
export function basicAuthHeader(): string {
	return `Basic ${Buffer.from(`${env.NEXTCLOUD_USER}:${env.NEXTCLOUD_APP_PASSWORD}`).toString('base64')}`;
}

/**
 * n8n webhook URL for create/update event writes (NCAL-2). SERVER-ONLY.
 * The CRM POSTs event payloads here; n8n performs the actual CalDAV PUT. This URL
 * and the shared secret must NEVER reach the client or any client-visible error.
 */
export function n8nCalendarWebhookUrl(): string | undefined {
	return env.N8N_CALENDAR_WEBHOOK_URL;
}

/** n8n webhook URL for delete event writes (NCAL-2). SERVER-ONLY. */
export function n8nCalendarDeleteWebhookUrl(): string | undefined {
	return env.N8N_CALENDAR_DELETE_WEBHOOK_URL;
}

/**
 * Shared secret sent as `x-webhook-secret` to authenticate the CRM → n8n call
 * (NCAL-2). SERVER-ONLY — must NEVER appear in any thrown error, log line, or
 * client-visible response body.
 */
export function n8nWebhookSecret(): string | undefined {
	return env.N8N_WEBHOOK_SECRET;
}

/**
 * Maps a raw iCal `CATEGORIES` value (case-insensitive) to a canonical CRM category.
 * Returns `null` for unmapped/absent categories (see `parser.ts`).
 */
export const CATEGORY_MAP: Record<string, string> = {
	meeting: 'meeting',
	golive: 'golive',
	'go-live': 'golive',
	eventstart: 'eventstart',
	'event-start': 'eventstart',
	'team-event': 'team-event',
	teamevent: 'team-event'
};

/** Default event color when no category matches. */
export const DEFAULT_EVENT_COLOR = '#22c55e';

/** Per-category display colors. Falls back to {@link DEFAULT_EVENT_COLOR}. */
export const CATEGORY_COLORS: Record<string, string> = {
	meeting: '#3b82f6',
	golive: '#22c55e',
	eventstart: '#f59e0b',
	'team-event': '#8b5cf6'
};
