import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userFormSchema } from '$lib/zod/schemas';
import { createUser } from '$lib/server/db/users';
import { canManageUsers } from '$lib/utils/permissions';
import { pendingWelcomeEmails } from '$lib/server/email-templates';
import { getAuth } from '$lib/server/auth';

// Manager-only: create a team member (the magic-link allowlist) and send them a
// welcome email containing a ready-to-use sign-in link. Better Auth still owns
// token issuance — we just trigger signInMagicLink, which fires sendMagicLink.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!canManageUsers(locals.user)) {
		throw error(403, 'Manager only');
	}

	const parsed = userFormSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid payload');
	}

	const { name, email, role } = parsed.data;

	// super_manager is a singleton reachable ONLY via the promote-super flow —
	// never created directly through the add-rep path.
	if (role === 'super_manager') {
		throw error(400, 'Super manager can only be assigned via role transfer');
	}

	let user;
	try {
		user = await createUser({ name, email, role });
	} catch (err) {
		// Unique constraint violation on crm_users.email → 409
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			return json({ error: 'email_taken' }, { status: 409 });
		}
		throw err;
	}

	// Mark this email as a welcome invite so sendMagicLink uses the welcome template.
	pendingWelcomeEmails.add(email);

	// Trigger Better Auth's magic-link flow. A send failure must NOT roll back the
	// user creation — log and still return 201.
	try {
		await (
			await getAuth()
		).api.signInMagicLink({
			body: { email, callbackURL: '/' },
			headers: request.headers
		});
	} catch (err) {
		pendingWelcomeEmails.delete(email);
		console.error('[api/users] signInMagicLink failed:', err);
	}

	return json(user, { status: 201 });
};
