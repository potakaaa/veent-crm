/**
 * Fully-Automated manager-guard coverage for the outreach-templates CRUD surface (AC-4).
 *
 * Two layers are proven here without a DB:
 *  1. The `isManager()` predicate itself rejects reps and allows managers.
 *  2. Every /api/templates write verb (POST/PATCH/DELETE) throws 403 for a rep.
 *     The manager guard runs BEFORE any DB access — these run green with no DATABASE_URL.
 *  3. The /templates page load succeeds for reps (read-only view; Templates moved to Workspace).
 *
 * The manager-SUCCESS path (verb reaches the DB) is DB-backed and is proven at the
 * Agent-Probe tier per the plan's Verification Evidence table, not here.
 */
import { describe, it, expect, vi } from 'vitest';
import { isManager } from '$lib/utils/permissions';
import type { User } from '$lib/types';
import { POST, PATCH, DELETE } from '../routes/api/templates/+server';

// Mock the DB layer so page load tests never need a real database.
vi.mock('$lib/server/db/templates', () => ({
	listTemplates: vi.fn().mockResolvedValue([]),
	listTemplatesPaginated: vi.fn().mockResolvedValue({ templates: [], total: 0 }),
	TEMPLATES_PAGE_SIZE: 20
}));

import { load } from '../routes/templates/+page.server';

const manager: User = {
	id: 'm1',
	email: 'boss@test.com',
	name: 'Boss',
	role: 'manager',
	active: true
};
const rep: User = {
	id: 'r1',
	email: 'rep@test.com',
	name: 'Rep',
	role: 'rep',
	active: true
};

// Minimal locals for the guard — only `user` is read by requireManager / the load guard.
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

async function expect403(fn: () => unknown) {
	await expect(Promise.resolve().then(fn)).rejects.toMatchObject({ status: 403 });
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

describe('/api/templates per-verb manager guard rejects a rep with 403 (AC-4)', () => {
	it('POST → 403', async () => {
		await expect403(() => POST(repEvent('POST')));
	});
	it('PATCH → 403', async () => {
		await expect403(() => PATCH(repEvent('PATCH')));
	});
	it('DELETE → 403', async () => {
		await expect403(() => DELETE(repEvent('DELETE')));
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
