/**
 * Fully-Automated guard coverage for the outreach-templates CRUD surface (GitHub #276).
 *
 * Edit (PATCH) and delete (DELETE) are open to all authenticated users — the manager-only
 * gate was removed (GitHub #276); an auth-only guard (`if (!locals.user) throw error(401)`)
 * runs before any DB access:
 *  1. The `isManager()` predicate itself still works correctly (still used by other features).
 *  2. Every /api/templates write verb (POST/PATCH/DELETE) succeeds for an authenticated rep
 *     (mocked DB — no DATABASE_URL needed).
 *  3. PATCH/DELETE still reject with 401 when there is no authenticated user at all — the
 *     auth boundary is preserved, only the manager boundary was removed.
 *  4. The /templates page load succeeds for reps (read-only view; Templates moved to Workspace).
 */
import { describe, it, expect, vi } from 'vitest';
import { isManager } from '$lib/utils/permissions';
import type { User } from '$lib/types';
import { POST, PATCH, DELETE } from '../routes/api/templates/+server';

// Mock the DB layer so page load tests never need a real database.
// vi.hoisted so the mock fn exists when the hoisted vi.mock factory runs.
const { createTemplateMock, updateTemplateMock, softDeleteTemplateMock } = vi.hoisted(() => ({
	createTemplateMock: vi
		.fn()
		.mockResolvedValue({ id: 't1', title: 't', category: 'Other', body: 'b', createdBy: 'r1' }),
	updateTemplateMock: vi.fn().mockResolvedValue(null),
	softDeleteTemplateMock: vi.fn().mockResolvedValue(false)
}));
vi.mock('$lib/server/db/templates', () => {
	class TemplateTitleConflictError extends Error {}
	return {
		listTemplates: vi.fn().mockResolvedValue([]),
		listTemplatesPaginated: vi.fn().mockResolvedValue({ templates: [], total: 0 }),
		createTemplate: createTemplateMock,
		updateTemplate: updateTemplateMock,
		softDeleteTemplate: softDeleteTemplateMock,
		TemplateTitleConflictError,
		TEMPLATES_PAGE_SIZE: 25
	};
});

import { load } from '../routes/templates/+page.server';

const manager: User = {
	id: 'm1',
	email: 'boss@test.com',
	name: 'Boss',
	firstName: 'Boss',
	lastName: null,
	role: 'manager',
	active: true
};
const rep: User = {
	id: 'r1',
	email: 'rep@test.com',
	name: 'Rep',
	firstName: 'Rep',
	lastName: null,
	role: 'rep',
	active: true
};

// Minimal locals for the guard — only `user` is read by the auth-only guard / the load guard.
function repEvent(method: string) {
	return {
		locals: { user: rep },
		request: new Request('http://localhost/api/templates', {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'x', title: 't', category: 'Other', body: 'b' })
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

// No authenticated user at all — proves the auth boundary (401) survived the manager-gate removal.
function nullUserEvent(method: string) {
	return {
		locals: { user: null },
		request: new Request('http://localhost/api/templates', {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'x', title: 't', category: 'Other', body: 'b' })
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

async function expectStatus(fn: () => unknown, status: number) {
	await expect(Promise.resolve().then(fn)).rejects.toMatchObject({ status });
}

describe('isManager predicate (AC-4)', () => {
	it('allows a manager', () => {
		expect(isManager(manager)).toBe(true);
	});
	it('rejects a rep', () => {
		expect(isManager(rep)).toBe(false);
	});
	it('rejects null/undefined', () => {
		expect(isManager(null)).toBe(false);
		expect(isManager(undefined)).toBe(false);
	});
});

// GitHub #199 — POST is open to any authenticated user.
// GitHub #276 — PATCH/DELETE are now also open to any authenticated user (edit/delete are
// no longer manager-only); the auth-only guard runs before any DB call, so unauth still 401.
describe('/api/templates create/edit/delete are open to all authenticated users (GitHub #199, #276); auth-only guard runs before DB; unauth still 401', () => {
	it('POST → succeeds for a rep; reaches the DB and returns 201', async () => {
		const res = await POST(repEvent('POST'));
		expect(res.status).toBe(201);
		// createdBy is sourced server-side from the session (rep id), never from the body.
		expect(createTemplateMock).toHaveBeenCalledWith(expect.anything(), rep.id);
	});
	it('PATCH → succeeds for a rep (200 + row), no longer 403', async () => {
		updateTemplateMock.mockResolvedValueOnce({
			id: 'x',
			title: 't',
			category: 'Other',
			body: 'b',
			createdBy: 'r1'
		});
		const res = await PATCH(repEvent('PATCH'));
		expect(res.status).toBe(200);
	});
	it('DELETE → succeeds for a rep (204), no longer 403 (delete-all)', async () => {
		softDeleteTemplateMock.mockResolvedValueOnce(true);
		const res = await DELETE(repEvent('DELETE'));
		expect(res.status).toBe(204);
	});
	it('PATCH → 401 when there is no authenticated user (auth boundary preserved)', async () => {
		await expectStatus(() => PATCH(nullUserEvent('PATCH')), 401);
	});
	it('DELETE → 401 when there is no authenticated user (auth boundary preserved)', async () => {
		await expectStatus(() => DELETE(nullUserEvent('DELETE')), 401);
	});
});

describe('/templates page load allows any authenticated user (AC-4 revised — Templates moved to Workspace section)', () => {
	it('load → resolves for a rep (read-only view)', async () => {
		const result = await load(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			{ locals: { user: rep }, url: new URL('http://localhost/templates') } as any
		);
		expect(result).toHaveProperty('templates');
		expect(result).toHaveProperty('currentUser');
		expect((result as { currentUser: { role: string } }).currentUser.role).toBe('rep');
	});
	it('load → 401 when unauthenticated', async () => {
		await expect(
			Promise.resolve().then(() =>
				load(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					{ locals: { user: null }, url: new URL('http://localhost/templates') } as any
				)
			)
		).rejects.toMatchObject({ status: 401 });
	});
});

function loadWith(qs: string) {
	const url = new URL(`http://localhost/templates${qs}`);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return load({ locals: { user: rep }, url } as any);
}

describe('/templates load — invalid query param normalization', () => {
	it('page=abc → pagination.page defaults to 1', async () => {
		const r = await loadWith('?page=abc');
		expect((r as { pagination: { page: number } }).pagination.page).toBe(1);
	});
	it('page=0 → pagination.page coerced to 1', async () => {
		const r = await loadWith('?page=0');
		expect((r as { pagination: { page: number } }).pagination.page).toBe(1);
	});
	it('category=invalid → filters.category is undefined', async () => {
		const r = await loadWith('?category=NotACategory');
		expect((r as { filters: { category: unknown } }).filters.category).toBeUndefined();
	});
	it('sort=invalid → filters.sort defaults to "title"', async () => {
		const r = await loadWith('?sort=random');
		expect((r as { filters: { sort: string } }).filters.sort).toBe('title');
	});
});
