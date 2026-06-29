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
import { db } from '$lib/server/db/index';
import { baUser, baAccount, baSession, baVerification } from '$lib/server/db/schema';
import { sendEmail } from './email';
import { env } from '$env/dynamic/private';

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: 'rep' | 'manager';
};

export const auth = betterAuth({
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
				await sendEmail({
					to: email,
					subject: 'Your Veent CRM login link',
					html: `<p>Click to sign in: <a href="${url}">${url}</a></p><p>Link expires in 5 minutes.</p>`
				});
			}
		}),
		dash({
			apiKey: env.BETTER_AUTH_API_KEY
		})
	]
});
