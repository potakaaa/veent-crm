/**
 * Manager dashboard role-gate unit tests (GitHub #244 / DASH-1 — AC1, AC2-gate).
 *
 * Fully-Automated tier: exercises the `/dashboard` load function's role gate with no DB.
 * `getDashboardData` is mocked so the manager/super_manager cases never open a socket —
 * the gate check runs synchronously before the data fetch.
 *
 * E3: SvelteKit's `error(403, ...)` throws an `HttpError`; assert the thrown shape with
 * `.rejects.toMatchObject({ status: 403 })` (no repo precedent for this assertion shape).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db/dashboard', () => ({
	getDashboardData: vi.fn(async () => []),
	rangeToStartDate: vi.fn(() => null)
}));

import { load } from '../routes/dashboard/+page.server';

type Role = 'rep' | 'manager' | 'super_manager';
type LoadOk = { range: string; dashboard: Promise<unknown[]> };

function makeEvent(role: Role, range = 'week') {
	return {
		locals: { user: { id: 'u1', role } },
		url: new URL(`http://localhost/dashboard?range=${range}`)
	} as unknown as Parameters<typeof load>[0];
}

describe('/dashboard role gate', () => {
	it("throws 403 for role='rep' hitting /dashboard (no data rendered)", async () => {
		await expect(load(makeEvent('rep'))).rejects.toMatchObject({ status: 403 });
	});

	it("passes the gate for role='manager'", async () => {
		const result = (await load(makeEvent('manager'))) as LoadOk;
		expect(result).toMatchObject({ range: 'week' });
		await expect(result.dashboard).resolves.toEqual([]);
	});

	it("passes the gate for role='super_manager'", async () => {
		const result = (await load(makeEvent('super_manager'))) as LoadOk;
		expect(result).toMatchObject({ range: 'week' });
		await expect(result.dashboard).resolves.toEqual([]);
	});

	it('throws 403 when there is no session user at all', async () => {
		const event = {
			locals: { user: null },
			url: new URL('http://localhost/dashboard')
		} as unknown as Parameters<typeof load>[0];
		await expect(load(event)).rejects.toMatchObject({ status: 403 });
	});

	it('falls back to range="week" for an invalid range param', async () => {
		const result = (await load(makeEvent('manager', 'nonsense'))) as LoadOk;
		expect(result.range).toBe('week');
	});
});
