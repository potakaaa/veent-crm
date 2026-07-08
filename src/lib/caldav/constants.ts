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
