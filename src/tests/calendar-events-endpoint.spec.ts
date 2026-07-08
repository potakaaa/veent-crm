/**
 * Unit tests for GET /api/calendar/events (NCAL-1, plan step 9).
 *
 * The reader and parser are mocked via vi.hoisted/vi.mock and GET is imported directly.
 * Proves the handler's gate/error-mapping/shape logic only (no network): no session → 401,
 * bad ?start → 400 (NOT 503), reader CalDavError → 503 with a leak-free message, and a
 * happy path returning { success, events, count } with count === events.length.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { fetchCalendarReport, parseIcsToEvents, MockCalDavError } = vi.hoisted(() => {
	class MockCalDavError extends Error {
		readonly upstreamStatus?: number;
		constructor(message: string, upstreamStatus?: number) {
			super(message);
			this.name = 'CalDavError';
			this.upstreamStatus = upstreamStatus;
		}
	}
	return {
		fetchCalendarReport: vi.fn(),
		parseIcsToEvents: vi.fn(),
		MockCalDavError
	};
});
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/caldav/reader', () => ({ fetchCalendarReport, CalDavError: MockCalDavError }));
vi.mock('$lib/caldav/parser', () => ({ parseIcsToEvents }));

import { GET } from '../routes/api/calendar/events/+server';

type GetParams = Parameters<typeof GET>[0];

function runGet(opts: { authed: boolean; query?: string }) {
	const url = new URL(`http://localhost/api/calendar/events${opts.query ?? ''}`);
	const event = {
		locals: { user: opts.authed ? { id: 'u1', role: 'rep' } : null },
		url
	} as unknown as GetParams;
	return GET(event);
}

beforeEach(() => {
	fetchCalendarReport.mockReset();
	parseIcsToEvents.mockReset();
});

describe('GET /api/calendar/events', () => {
	it('throws 401 when there is no CRM session', async () => {
		let thrown: unknown;
		try {
			await runGet({ authed: false });
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(401);
		expect(fetchCalendarReport).not.toHaveBeenCalled();
	});

	it('throws 400 (NOT 503) on an unparseable ?start', async () => {
		let thrown: unknown;
		try {
			await runGet({ authed: true, query: '?start=not-a-date&end=2026-08-01T00:00:00Z' });
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(400);
		expect((thrown as { status: number }).status).not.toBe(503);
		expect(fetchCalendarReport).not.toHaveBeenCalled();
	});

	it('maps a reader CalDavError to a leak-free 503', async () => {
		fetchCalendarReport.mockRejectedValueOnce(
			new MockCalDavError('Calendar service unavailable', 401)
		);
		let thrown: unknown;
		try {
			await runGet({ authed: true });
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(503);
		const body = (thrown as { body: { message: string } }).body;
		expect(body.message).not.toContain('401');
		expect(body.message).not.toContain('password');
	});

	it('returns 200 { success, events, count } with count === events.length', async () => {
		const fakeEvents = [
			{ uid: 'a', title: 'A' },
			{ uid: 'b', title: 'B' }
		];
		fetchCalendarReport.mockResolvedValueOnce(['blob-1']);
		parseIcsToEvents.mockReturnValueOnce(fakeEvents);
		const res = await runGet({ authed: true });
		expect(res.status).toBe(200);
		const payload = await res.json();
		expect(payload.success).toBe(true);
		expect(payload.count).toBe(2);
		expect(payload.count).toBe(payload.events.length);
	});
});
