import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { asc, desc } from 'drizzle-orm';
import { dbUserToUser } from '$lib/server/db/leads';

// Manager-only: this roster doubles as the magic-link allowlist (active reps with email).
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'manager') {
		error(403, 'Manager only');
	}
	const rows = await db
		.select()
		.from(crmUsers)
		.orderBy(desc(crmUsers.active), asc(crmUsers.name));
	return { users: rows.map(dbUserToUser) };
};
