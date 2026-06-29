// Session gate — rejects any request whose Better Auth session email isn't an active
// crm_users row, on EVERY route except /login, /health, the secret-authed /api endpoints,
// and the Better Auth handler (/api/auth/*). Role + id are resolved from crm_users (the
// allowlist + domain source of truth), NOT from the Better Auth user record.

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { initSentry } from '$lib/server/sentry';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

initSentry(); // no-op stub

// routes reachable without a session
const PUBLIC_PREFIXES = [
	'/login',
	'/health',
	'/api/reminders/due',
	'/api/leads/ingest',
	'/api/auth'
];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session?.user?.email) {
		// Allowlist check: an active crm_users row must exist for this email.
		// role + id come from crm_users, not from the Better Auth user.
		const [crmUser] = await db
			.select()
			.from(crmUsers)
			.where(and(eq(crmUsers.email, session.user.email), eq(crmUsers.active, true)))
			.limit(1);

		event.locals.user =
			crmUser && crmUser.email
				? { id: crmUser.id, email: crmUser.email, name: crmUser.name, role: crmUser.role }
				: null;
	} else {
		event.locals.user = null;
	}

	if (!isPublic && !event.locals.user) {
		redirect(303, '/login');
	}

	return resolve(event);
};
