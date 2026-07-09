/**
 * Unit tests for the session gate in src/hooks.server.ts (issue #80 redirect behavior)
 * plus the shared open-redirect helper and the login route's server load.
 *
 *   7a: unauthenticated → /login (now with ?from= preserved)
 *   7b: authenticated + allowlisted → passthrough, locals.user populated
 *   7c: session but not allowlisted → /unauthorized?from=
 *   7d: unauthenticated hit on /login itself → no redirect loop
 *   7e: sanitizeFrom rejection branches + valid pass-through (shared helper)
 *   7f: login/+page.server.ts load() returns sanitized `from`
 *
 * auth.api.getSession and the Drizzle allowlist chain are mocked — this proves the gate's
 * routing logic, not real Better Auth session parsing or a real DB round trip (see the plan's
 * "What this coverage does NOT prove").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { getSession, limit } = vi.hoisted(() => ({ getSession: vi.fn(), limit: vi.fn() }));

vi.mock('$lib/server/auth', () => ({
	auth: { api: { getSession } }
}));

vi.mock('$lib/server/db/index', () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ limit }) }) })
	}
}));

import { handle } from '../hooks.server';
import { sanitizeFrom } from '$lib/server/sanitize-redirect';
import { load as loginLoad } from '../routes/login/+page.server';

type HandleParams = Parameters<typeof handle>[0];

async function runHandle(path: string) {
	const event = {
		url: new URL('http://localhost' + path),
		request: { headers: new Headers() },
		locals: {} as App.Locals
	} as unknown as HandleParams['event'];
	const resolve = vi
		.fn()
		.mockResolvedValue(new Response('ok')) as unknown as HandleParams['resolve'];

	let thrown: unknown;
	try {
		await handle({ event, resolve });
	} catch (e) {
		thrown = e;
	}
	return { event, resolve, thrown };
}

beforeEach(() => {
	getSession.mockReset();
	limit.mockReset();
});

// ---------------------------------------------------------------------------
// 7a — unauthenticated request to a protected route → /login (with ?from=)
// ---------------------------------------------------------------------------

describe('handle — unauthenticated protected route (7a)', () => {
	it('throws a 303 redirect to /login preserving the requested path', async () => {
		getSession.mockResolvedValue(null);

		const { thrown, resolve } = await runHandle('/leads');

		expect(isRedirect(thrown)).toBe(true);
		const redirect = thrown as { status: number; location: string };
		expect(redirect.status).toBe(303);
		// item 4: redirect now carries ?from= (encodeURIComponent('/leads'))
		expect(redirect.location.startsWith('/login')).toBe(true);
		expect(redirect.location).toBe('/login?from=%2Fleads');
		expect(resolve).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 7b — authenticated + allowlisted → passthrough, locals.user populated
// ---------------------------------------------------------------------------

describe('handle — authenticated allowlisted user (7b)', () => {
	it('does not redirect, calls resolve, and populates locals.user', async () => {
		getSession.mockResolvedValue({ user: { email: 'rep@veent.io' } });
		limit.mockResolvedValue([
			{
				id: 'u-1',
				email: 'rep@veent.io',
				firstName: 'Rep',
				lastName: 'One',
				role: 'rep',
				active: true
			}
		]);

		const { thrown, resolve, event } = await runHandle('/leads');

		expect(thrown).toBeUndefined();
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.user).toEqual({
			id: 'u-1',
			email: 'rep@veent.io',
			name: 'Rep One',
			firstName: 'Rep',
			lastName: 'One',
			role: 'rep'
		});
	});
});

// ---------------------------------------------------------------------------
// 7c — session exists but no active crm_users row → /unauthorized?from=
// ---------------------------------------------------------------------------

describe('handle — session without allowlist row (7c)', () => {
	it('throws a 303 redirect to /unauthorized?from=', async () => {
		getSession.mockResolvedValue({ user: { email: 'stranger@example.com' } });
		limit.mockResolvedValue([]);

		const { thrown, resolve } = await runHandle('/leads');

		expect(isRedirect(thrown)).toBe(true);
		const redirect = thrown as { status: number; location: string };
		expect(redirect.status).toBe(303);
		expect(redirect.location.startsWith('/unauthorized?from=')).toBe(true);
		expect(redirect.location).toBe('/unauthorized?from=%2Fleads');
		expect(resolve).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 7d — unauthenticated hit on /login itself → no redirect loop
// ---------------------------------------------------------------------------

describe('handle — /login is public, no redirect loop (7d)', () => {
	it('does not redirect when unauthenticated on /login', async () => {
		getSession.mockResolvedValue(null);

		const { thrown, resolve } = await runHandle('/login');

		expect(thrown).toBeUndefined();
		expect(resolve).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// 7e — shared sanitizeFrom open-redirect guard
// ---------------------------------------------------------------------------

describe('sanitizeFrom — open-redirect guard (7e)', () => {
	it('rejects null and empty string', () => {
		expect(sanitizeFrom(null)).toBeNull();
		expect(sanitizeFrom('')).toBeNull();
	});

	it('rejects a path missing the leading slash', () => {
		expect(sanitizeFrom('leads')).toBeNull();
	});

	it('rejects protocol-relative // targets', () => {
		expect(sanitizeFrom('//evil.example.com')).toBeNull();
	});

	it('rejects backslash-relative /\\ targets', () => {
		expect(sanitizeFrom('/\\evil.example.com')).toBeNull();
	});

	it('rejects any value carrying a scheme (contains ":")', () => {
		expect(sanitizeFrom('/redirect?u=https://evil.example.com')).toBeNull();
		expect(sanitizeFrom('/a:b')).toBeNull();
	});

	it('passes a valid same-origin relative path through unchanged', () => {
		expect(sanitizeFrom('/leads/123')).toBe('/leads/123');
	});
});

// ---------------------------------------------------------------------------
// 7f — login/+page.server.ts load() returns sanitized `from`
// ---------------------------------------------------------------------------

describe('login load() — from preservation (7f)', () => {
	it('returns the sanitized from param for a valid same-origin path', () => {
		const result = loginLoad({
			url: new URL('http://x/login?from=%2Fleads')
		} as Parameters<typeof loginLoad>[0]);
		expect(result).toEqual({ from: '/leads' });
	});

	it('returns { from: null } for a malicious off-origin from param', () => {
		const result = loginLoad({
			url: new URL('http://x/login?from=%2F%2Fevil.example.com')
		} as Parameters<typeof loginLoad>[0]);
		expect(result).toEqual({ from: null });
	});

	it('returns { from: null } when no from param is present', () => {
		const result = loginLoad({
			url: new URL('http://x/login')
		} as Parameters<typeof loginLoad>[0]);
		expect(result).toEqual({ from: null });
	});
});
