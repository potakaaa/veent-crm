/**
 * Fully-Automated manager-guard coverage for the outreach-templates CRUD surface (AC-4).
 *
 * Two layers are proven here without a DB:
 *  1. The `isManager()` predicate itself rejects reps and allows managers.
 *  2. Every /api/templates verb (POST/PATCH/DELETE) AND the /templates page load
 *     throw 403 for a signed-in rep. The manager guard runs BEFORE any DB access,
 *     so a rep never reaches Drizzle — these run green with no DATABASE_URL.
 *
 * The manager-SUCCESS path (verb reaches the DB) is DB-backed and is proven at the
 * Agent-Probe tier per the plan's Verification Evidence table, not here.
 */
import { describe, it, expect } from 'vitest';
import { isManager } from '$lib/utils/permissions';
import type { User } from '$lib/types';
import { POST, PATCH, DELETE } from '../routes/api/templates/+server';
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

describe('/templates page load manager guard rejects a rep with 403 (AC-4)', () => {
	it('load → 403', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect403(() => load({ locals: { user: rep } } as any));
	});
});
