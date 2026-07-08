/**
 * Unit tests for the CalDAV reader (NCAL-1, plan step 8).
 *
 * `$env/dynamic/private` and global `fetch` are mocked via vi.hoisted/vi.mock so the
 * reader can be exercised with no network and deterministic env. Proves: buildReportBody
 * emits a UTC time-range derived from Date args (XML-injection guard), multistatus
 * extraction returns each `.ics` blob, an upstream 401 maps to a leak-free CalDavError,
 * and calendarCollectionUrl builds the expected URL (no double scheme, slug not re-encoded).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { envState } = vi.hoisted(() => ({
	envState: {} as Record<string, string | undefined>
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

import {
	buildReportBody,
	extractCalendarData,
	fetchCalendarReport,
	CalDavError
} from '$lib/caldav/reader';
import { calendarCollectionUrl } from '$lib/caldav/constants';

function fixture(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

beforeEach(() => {
	for (const k of Object.keys(envState)) delete envState[k];
	envState.NEXTCLOUD_URL = 'https://team.veent.io';
	envState.NEXTCLOUD_USER = 'team';
	envState.NEXTCLOUD_APP_PASSWORD = 'super-secret-app-password';
	envState.NEXTCLOUD_CALENDAR_SLUG = 'veent-team';
	vi.restoreAllMocks();
});

describe('buildReportBody', () => {
	it('formats the time-range as YYYYMMDDTHHMMSSZ derived from the Date args', () => {
		const body = buildReportBody(
			new Date('2026-07-01T00:00:00Z'),
			new Date('2026-08-01T00:00:00Z')
		);
		expect(body).toContain('start="20260701T000000Z"');
		expect(body).toContain('end="20260801T000000Z"');
	});

	it('never lets a raw injection-y string reach the body (formatted from Date only)', () => {
		// A malicious raw ?start value is irrelevant — the reader only accepts Date args.
		const evilAsDate = new Date('"/><c:evil/>');
		const body = buildReportBody(evilAsDate, new Date('2026-08-01T00:00:00Z'));
		expect(body).not.toContain('<c:evil/>');
		// Invalid Date formats to NaN-padded digits, never raw XML.
		expect(body).toContain('end="20260801T000000Z"');
	});
});

describe('extractCalendarData', () => {
	it('extracts each c:calendar-data blob from a 207 multistatus body', () => {
		const blobs = extractCalendarData(fixture('collection-multi.ics'));
		expect(blobs.length).toBeGreaterThanOrEqual(2);
		expect(blobs[0]).toContain('UID:multi-1@veent.io');
		expect(blobs[1]).toContain('UID:multi-2@veent.io');
	});
});

describe('fetchCalendarReport', () => {
	it('returns extracted blobs from a 207 multistatus response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(fixture('collection-multi.ics'), { status: 207 }))
		);
		const blobs = await fetchCalendarReport({
			start: new Date('2026-07-01T00:00:00Z'),
			end: new Date('2026-08-01T00:00:00Z')
		});
		expect(blobs.length).toBeGreaterThanOrEqual(2);
	});

	it('throws a leak-free CalDavError on an upstream 401', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('Unauthorized', { status: 401 }))
		);
		let thrown: unknown;
		try {
			await fetchCalendarReport({
				start: new Date('2026-07-01T00:00:00Z'),
				end: new Date('2026-08-01T00:00:00Z')
			});
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(CalDavError);
		const message = (thrown as CalDavError).message;
		expect(message).not.toContain('401');
		expect(message).not.toContain('super-secret-app-password');
		expect(message).not.toContain('team');
	});
});

describe('calendarCollectionUrl', () => {
	it('builds the expected URL with no double scheme and no re-encoded slug', () => {
		expect(calendarCollectionUrl()).toBe(
			'https://team.veent.io/remote.php/dav/calendars/team/veent-team/'
		);
	});
});
