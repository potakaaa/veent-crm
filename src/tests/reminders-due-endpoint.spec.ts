/**
 * Unit tests for the GET /api/reminders/due secret gate (vercel-deploy-migration plan §B).
 *
 * The endpoint must FAIL CLOSED — matching its /api/reminders/notify sibling:
 *   - REMINDERS_ENDPOINT_SECRET unset  → 401 (previously fail-OPEN: allowed the request)
 *   - provided bearer mismatches       → 401
 *   - provided bearer matches          → 200 (getDueReminders/getDueMeetingReminders mocked —
 *                                        the 200 path calls the DB after the guard)
 *
 * The guard throw precedes any DB call, so the two 401 cases need no DB mock. Env is a mutable
 * object so each test can set/unset the secret without re-importing the handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { envState, getDueReminders, getDueMeetingReminders } = vi.hoisted(() => ({
	envState: {} as Record<string, string | undefined>,
	getDueReminders: vi.fn(async () => [] as unknown[]),
	getDueMeetingReminders: vi.fn(async () => [] as unknown[])
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('$lib/server/reminders', () => ({ getDueReminders }));
vi.mock('$lib/server/db/meeting-reminders', () => ({ getDueMeetingReminders }));

import { GET } from '../routes/api/reminders/due/+server';

type GetParams = Parameters<typeof GET>[0];

function runGet(bearer?: string) {
	const headers = new Headers();
	if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
	const event = { request: { headers } } as unknown as GetParams;
	return GET(event);
}

beforeEach(() => {
	for (const k of Object.keys(envState)) delete envState[k];
	getDueReminders.mockClear();
	getDueMeetingReminders.mockClear();
});

describe('GET /api/reminders/due — fail-closed secret gate', () => {
	it('returns 401 when REMINDERS_ENDPOINT_SECRET is unset (fail closed)', async () => {
		// secret intentionally NOT set on envState
		let thrown: unknown;
		try {
			await runGet('anything');
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(401);
		expect(getDueReminders).not.toHaveBeenCalled();
	});

	it('returns 401 when the provided bearer does not match the secret', async () => {
		envState.REMINDERS_ENDPOINT_SECRET = 'correct-secret';
		let thrown: unknown;
		try {
			await runGet('wrong-secret');
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(401);
		expect(getDueMeetingReminders).not.toHaveBeenCalled();
	});

	it('returns 401 when no authorization header is present', async () => {
		envState.REMINDERS_ENDPOINT_SECRET = 'correct-secret';
		let thrown: unknown;
		try {
			await runGet(undefined);
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(401);
	});

	it('returns 200 with the due payload when the bearer matches', async () => {
		envState.REMINDERS_ENDPOINT_SECRET = 'correct-secret';
		const res = await runGet('correct-secret');
		expect(res.status).toBe(200);
		expect(getDueReminders).toHaveBeenCalledTimes(1);
		expect(getDueMeetingReminders).toHaveBeenCalledTimes(1);
		await expect(res.json()).resolves.toEqual({ due: [], meetingsDue: [] });
	});
});
