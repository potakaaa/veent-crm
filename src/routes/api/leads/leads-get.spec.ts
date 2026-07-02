import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB-free: mock the leads DB module so no postgres connection is attempted.
// The route file exports both GET (under test) and POST (imports createLead),
// so both DB fns the module surfaces must be present on the mock.
vi.mock('$lib/server/db/leads', () => ({
	listLeadsFiltered: vi.fn(),
	createLead: vi.fn()
}));

import { GET } from './+server';
import { listLeadsFiltered } from '$lib/server/db/leads';

const mockList = vi.mocked(listLeadsFiltered);

function makeEvent(search: string, user: unknown) {
	return {
		url: new URL(`http://localhost/api/leads${search}`),
		locals: { user }
	} as unknown as Parameters<typeof GET>[0];
}

const sessionUser = { id: 'me-123', email: 'me@x.io', name: 'Me', role: 'rep' };

describe('GET /api/leads — security scoping (AC4)', () => {
	beforeEach(() => {
		mockList.mockReset();
		mockList.mockResolvedValue({ leads: [{ id: 'l1', name: 'Acme' }] as never, total: 1 });
	});

	it('scopes userId/role/segment ONLY from locals.user and ignores adversarial query params', async () => {
		await GET(makeEvent('?q=acme&page=2&userId=other-999&role=manager&segment=lost', sessionUser));

		expect(mockList).toHaveBeenCalledTimes(1);
		const args = mockList.mock.calls[0][0];
		// Session-derived scoping — NEVER the client-sent overrides.
		expect(args.userId).toBe('me-123');
		expect(args.role).toBe('rep');
		expect(args.segment).toBe('all');
		// Trusted-for-search-only params still flow through.
		expect(args.search).toBe('acme');
		expect(args.page).toBe(2);
		// Explicit negative assertions on the adversarial values.
		expect(args.userId).not.toBe('other-999');
		expect(args.role).not.toBe('manager');
		expect(args.segment).not.toBe('lost');
	});

	it('defaults page to 1 and search to undefined when absent', async () => {
		await GET(makeEvent('', sessionUser));
		const args = mockList.mock.calls[0][0];
		expect(args.page).toBe(1);
		expect(args.search).toBeUndefined();
		expect(args.segment).toBe('all');
	});

	it('returns 401 when unauthenticated', async () => {
		await expect(GET(makeEvent('?q=acme', null))).rejects.toMatchObject({ status: 401 });
		expect(mockList).not.toHaveBeenCalled();
	});
});
