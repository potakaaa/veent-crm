/**
 * Unit tests for PATCH /api/users/[id] — manager-only color gate (GitHub #275 AC1).
 *
 * The Drizzle `db` module is mocked via vi.hoisted/vi.mock; PATCH is imported directly.
 * Proves: rep-self setting own color → 403, rep setting another's color → 403,
 * manager setting another's color → 200 with color threaded into the update, and
 * an invalid hex payload → 400.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { updateMock, setMock, whereMock, returningMock } = vi.hoisted(() => {
	const returningMock = vi.fn();
	const whereMock = vi.fn(() => ({ returning: returningMock }));
	const setMock = vi.fn(() => ({ where: whereMock }));
	const updateMock = vi.fn(() => ({ set: setMock }));
	return { updateMock, setMock, whereMock, returningMock };
});
vi.mock('$lib/server/db', () => ({ db: { update: updateMock } }));

import { PATCH } from '../routes/api/users/[id]/+server';

type PatchParams = Parameters<typeof PATCH>[0];

function runPatch(opts: {
	actorId: string;
	actorRole: string;
	targetId: string;
	body: Record<string, unknown>;
}) {
	const event = {
		params: { id: opts.targetId },
		request: { json: () => Promise.resolve(opts.body) },
		locals: { user: { id: opts.actorId, role: opts.actorRole } }
	} as unknown as PatchParams;
	return PATCH(event);
}

beforeEach(() => {
	updateMock.mockClear();
	setMock.mockClear();
	whereMock.mockClear();
	returningMock.mockReset();
	returningMock.mockResolvedValue([
		{
			id: 'u2',
			firstName: 'Marites',
			lastName: 'Santos',
			email: 'marites@veent.io',
			role: 'rep',
			active: true,
			color: '#a1b2c3'
		}
	]);
});

async function expectStatus(promise: unknown, status: number) {
	let thrown: unknown;
	try {
		await promise;
	} catch (e) {
		thrown = e;
	}
	expect(isHttpError(thrown)).toBe(true);
	expect((thrown as { status: number }).status).toBe(status);
}

describe('PATCH /api/users/[id] — color manager-only gate (GitHub #275)', () => {
	it('rejects a rep setting their own color (403)', async () => {
		await expectStatus(
			runPatch({
				actorId: 'u1',
				actorRole: 'rep',
				targetId: 'u1',
				body: { color: '#a1b2c3' }
			}),
			403
		);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("rejects a rep setting another rep's color (403)", async () => {
		await expectStatus(
			runPatch({
				actorId: 'u1',
				actorRole: 'rep',
				targetId: 'u2',
				body: { color: '#a1b2c3' }
			}),
			403
		);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("allows a manager setting another user's color (200, color threaded into update)", async () => {
		const res = await runPatch({
			actorId: 'm1',
			actorRole: 'manager',
			targetId: 'u2',
			body: { color: '#a1b2c3' }
		});
		expect(res.status).toBe(200);
		expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ color: '#a1b2c3' }));
	});

	it('rejects an invalid hex color (400)', async () => {
		let thrown: unknown;
		try {
			await runPatch({
				actorId: 'm1',
				actorRole: 'manager',
				targetId: 'u2',
				body: { color: 'not-a-hex' }
			});
		} catch (e) {
			thrown = e;
		}
		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(400);
		expect(updateMock).not.toHaveBeenCalled();
	});
});
