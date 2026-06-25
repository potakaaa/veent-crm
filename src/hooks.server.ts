// Session gate — STUB for v0. See sales-crm.md §Access & auth.
//
// Target behavior: reject any session whose verified email isn't an active crm_users row, on
// EVERY route except /login, /health, and the secret-authed /api endpoints. Magic-link issuance
// is allowlisted; no auto-provisioning.
//
// For now there is no real Better Auth session, so we inject a fake "dev" manager into locals
// so the surfaces render. Flip DEV_BYPASS to false once Better Auth is wired.

import type { Handle } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth';
import { initSentry } from '$lib/server/sentry';

initSentry(); // no-op stub

const DEV_BYPASS = true;

const DEV_USER: SessionUser = {
	id: 'u-manager',
	email: 'john.sabuga@veent.io',
	name: 'John (Manager)',
	role: 'manager'
};

// routes reachable without a session
const PUBLIC_PREFIXES = ['/login', '/health', '/api/reminders/due', '/api/leads/ingest'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

	if (DEV_BYPASS) {
		event.locals.user = DEV_USER;
	} else {
		// TODO(better-auth): event.locals.user = await auth.getSession(event.request) -> allowlist check
		event.locals.user = null;
	}

	if (!isPublic && !event.locals.user) {
		// TODO: redirect(303, '/login') once login exists for real.
	}

	return resolve(event);
};
