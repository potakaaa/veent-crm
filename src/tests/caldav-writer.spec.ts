/**
 * Unit tests for the NCAL-2 CalDAV write client (plan step 9).
 *
 * Mocks `$env/dynamic/private` (webhook URLs + secret) and the global `fetch`. Proves:
 *  - AC4: writer POSTs the correct URL, method, `x-webhook-secret` header, and JSON body.
 *  - AC5 / AC9 (unit): a non-2xx or network failure throws `CalDavWebhookError` whose
 *    message + all serialized fields contain NO secret, NO webhook URL, NO upstream body.
 *  - AC6: the Zod schemas reject missing/invalid `title`/`start`/`end` + bad ISO.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted so the vi.mock factory (itself hoisted above the module body) can reference them.
const { WEBHOOK_URL, DELETE_URL, SECRET } = vi.hoisted(() => ({
	WEBHOOK_URL: 'https://n8n.example.test/webhook/create',
	DELETE_URL: 'https://n8n.example.test/webhook/delete',
	SECRET: 'super-secret-token-value'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		N8N_CALENDAR_WEBHOOK_URL: WEBHOOK_URL,
		N8N_CALENDAR_DELETE_WEBHOOK_URL: DELETE_URL,
		N8N_WEBHOOK_SECRET: SECRET
	}
}));

import { createEvent, updateEvent, deleteEvent, CalDavWebhookError } from '$lib/caldav/writer';
import { createCalendarEventSchema } from '$lib/zod/schemas';

const PAYLOAD = {
	uid: 'evt-1',
	title: 'Team sync',
	start: '2026-07-03T14:00:00Z',
	end: '2026-07-03T15:00:00Z',
	location: 'HQ',
	description: 'CRM-HREF:/leads/abc\nNotes'
};

describe('CalDAV writer (NCAL-2)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('createEvent POSTs correct URL/method/x-webhook-secret header and n8n-format body (AC4)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await createEvent(PAYLOAD);
		expect(result).toEqual({ uid: 'evt-1' });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(WEBHOOK_URL);
		expect(init.method).toBe('POST');
		expect(init.headers['x-webhook-secret']).toBe(SECRET);
		expect(init.headers['Content-Type']).toBe('application/json');

		// n8n expects Manila-local date/time components (UTC+8), not ISO 8601 start/end.
		// PAYLOAD.start '2026-07-03T14:00:00Z' → Manila 2026-07-03T22:00 → date "2026-07-03", startTime "22:00"
		// PAYLOAD.end   '2026-07-03T15:00:00Z' → Manila 2026-07-03T23:00 → endTime "23:00"
		expect(JSON.parse(init.body)).toEqual({
			uid: 'evt-1',
			title: 'Team sync',
			date: '2026-07-03',
			startTime: '22:00',
			endTime: '23:00',
			location: 'HQ',
			description: 'CRM-HREF:/leads/abc\nNotes'
		});
	});

	it('updateEvent POSTs to the create/update webhook with uid set (AC4)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await updateEvent('evt-9', { title: 'Renamed', start: PAYLOAD.start, end: PAYLOAD.end });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(WEBHOOK_URL);
		expect(JSON.parse(init.body)).toMatchObject({ uid: 'evt-9', title: 'Renamed' });
	});

	it('deleteEvent POSTs { uid } to the delete webhook (AC4)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await deleteEvent('evt-del');

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(DELETE_URL);
		expect(JSON.parse(init.body)).toEqual({ uid: 'evt-del' });
	});

	it('non-2xx from n8n throws CalDavWebhookError with NO secret/URL/upstream leak (AC5, AC9-unit)', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('upstream stack trace detail', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);

		let thrown: unknown;
		try {
			await createEvent(PAYLOAD);
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(CalDavWebhookError);
		const err = thrown as CalDavWebhookError;
		expect(err.message).toBe('Calendar service unavailable');
		// upstreamStatus is internal (server-log only) but must NOT leak via any serialized field.
		const serialized = JSON.stringify({ ...err, msg: err.message });
		expect(serialized).not.toContain(SECRET);
		expect(serialized).not.toContain(WEBHOOK_URL);
		expect(serialized).not.toContain('upstream stack trace detail');
	});

	it('network failure throws CalDavWebhookError with the client-safe message (AC5)', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED n8n.example.test'));
		vi.stubGlobal('fetch', fetchMock);

		let thrown: unknown;
		try {
			await createEvent(PAYLOAD);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(CalDavWebhookError);
		const err = thrown as CalDavWebhookError;
		expect(err.message).toBe('Calendar service unavailable');
		expect(JSON.stringify({ ...err, msg: err.message })).not.toContain('ECONNREFUSED');
	});
});

describe('createCalendarEventSchema (NCAL-2, AC6)', () => {
	it('accepts a valid payload', () => {
		const r = createCalendarEventSchema.safeParse({
			title: 'ok',
			start: '2026-07-03T14:00:00Z',
			end: '2026-07-03T15:00:00Z'
		});
		expect(r.success).toBe(true);
	});

	it('rejects a missing title', () => {
		const r = createCalendarEventSchema.safeParse({
			start: '2026-07-03T14:00:00Z',
			end: '2026-07-03T15:00:00Z'
		});
		expect(r.success).toBe(false);
	});

	it('rejects a blank title', () => {
		const r = createCalendarEventSchema.safeParse({
			title: '   ',
			start: '2026-07-03T14:00:00Z',
			end: '2026-07-03T15:00:00Z'
		});
		expect(r.success).toBe(false);
	});

	it('rejects a missing start', () => {
		const r = createCalendarEventSchema.safeParse({
			title: 'ok',
			end: '2026-07-03T15:00:00Z'
		});
		expect(r.success).toBe(false);
	});

	it('rejects a non-ISO start', () => {
		const r = createCalendarEventSchema.safeParse({
			title: 'ok',
			start: 'not-a-date',
			end: '2026-07-03T15:00:00Z'
		});
		expect(r.success).toBe(false);
	});
});
