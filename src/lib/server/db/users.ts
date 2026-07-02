/**
 * Server-side DB access for creating CRM users (the magic-link allowlist).
 * Re-uses the `dbUserToUser` mapper from leads.ts — do NOT duplicate it.
 */
import { db } from './index';
import { crmUsers } from './schema';
import { dbUserToUser } from './leads';
import type { User, Role } from '$lib/types';

/**
 * Insert a new team member (rep or manager) into `crm_users`.
 * A duplicate email violates the `crm_users_email_uq` unique index and surfaces
 * as a postgres error with code `23505` — this is left to propagate so the
 * caller (POST /api/users) can map it to a 409.
 */
export async function createUser(input: {
	name: string;
	email: string;
	role: Role;
}): Promise<User> {
	const [row] = await db
		.insert(crmUsers)
		.values({
			name: input.name,
			email: input.email,
			role: input.role
		})
		.returning();

	return dbUserToUser(row);
}
