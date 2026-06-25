// Better Auth — STUB for v0. See sales-crm.md §Access & auth.
//
// Target design (NOT wired yet — no Resend, no real magic link in this skeleton):
//   - Better Auth owns its user/account/session/verification tables in the CRM's own Postgres.
//   - Magic-link issuance is ALLOWLISTED to active crm_users (5 reps + manager); no auto-provision.
//   - hooks.server.ts rejects any session whose verified email isn't an active crm_users row.
//   - Later: enable the SSO plugin (Authentik/OIDC) and store the IdP `sub` in crm_users.auth_subject.
//
// For now this exports placeholders so the app compiles and the gate has a shape to call.

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: 'rep' | 'manager';
};

// TODO(better-auth): replace with the real Better Auth server instance + drizzle adapter.
export const auth = {
	/** Placeholder: validate the request's session cookie against Better Auth + the crm_users allowlist. */
	async getSession(_request: Request): Promise<{ user: SessionUser } | null> {
		// STUB: no real auth yet. hooks.server.ts injects a dev user instead.
		return null;
	},
	/** Placeholder: issue an allowlisted magic link via Resend. */
	async sendMagicLink(_email: string): Promise<void> {
		// TODO(resend): wire Better Auth magicLink plugin -> email.ts
		throw new Error('auth.sendMagicLink: not implemented (stub)');
	}
};

/** The allowlist check the session gate will enforce: email must belong to an active crm_users row. */
export async function isAllowlistedEmail(_email: string): Promise<boolean> {
	// TODO: query crm_users WHERE email = ? AND active = true
	return true; // STUB
}
