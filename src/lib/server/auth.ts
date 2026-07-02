// Better Auth — magic-link auth over the CRM's own Postgres.
//
// Design:
//   - Better Auth owns its user/account/session/verification tables (table names
//     user/account/session/verification — mapped via the drizzle adapter below).
//   - Magic-link issuance + session signing happen here; email delivery via Resend (email.ts).
//   - The crm_users allowlist (active row by email) is enforced in hooks.server.ts, which is
//     also where SessionUser.role is resolved from crm_users (NOT from the Better Auth user).
//   - BETTER_AUTH_API_KEY (dashboard) is env-only — not a betterAuth() option in this version.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { dash } from '@better-auth/infra';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { baUser, baAccount, baSession, baVerification, crmUsers } from '$lib/server/db/schema';
import { sendEmail } from './email';
import { pendingWelcomeEmails, welcomeEmail, loginEmail } from './email-templates';
import { env } from '$env/dynamic/private';

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: 'rep' | 'manager';
};

function createAuth() {
	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user: baUser,
				account: baAccount,
				session: baSession,
				verification: baVerification
			}
		}),
		plugins: [
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					console.log(`\n[DEV] Magic link for ${email}:\n${url}\n`);
					if (pendingWelcomeEmails.has(email)) {
						// This email was just added by a manager via POST /api/users — send the
						// welcome template with a personalized name looked up from crm_users.
						pendingWelcomeEmails.delete(email);
						const [row] = await db
							.select({ name: crmUsers.name })
							.from(crmUsers)
							.where(eq(crmUsers.email, email))
							.limit(1);
						await sendEmail({ to: email, ...welcomeEmail(row?.name ?? 'there', url) });
					} else {
						await sendEmail({ to: email, ...loginEmail(url) });
					}
				}
			}),
			dash({
				apiKey: env.BETTER_AUTH_API_KEY
			})
		]
	});
}

let _auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
	if (!_auth) _auth = createAuth();
	return _auth;
}

// Convenience proxy so existing callers (`auth.api.getSession`, `toSvelteKitHandler(auth)`)
// keep working without changes.
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
	get(_target, prop) {
		return getAuth()[prop as keyof ReturnType<typeof createAuth>];
	}
});
