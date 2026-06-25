import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { asc } from 'drizzle-orm';

// Manager-only: this roster doubles as the magic-link allowlist (active reps with email).
// Real impl will gate on locals.user.role === 'manager'.
export const load: PageServerLoad = async () => {
	const users = await db.select().from(crmUsers).orderBy(asc(crmUsers.active), asc(crmUsers.name));
	return { users };
};
