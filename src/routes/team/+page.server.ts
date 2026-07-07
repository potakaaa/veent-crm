import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { asc, desc } from 'drizzle-orm';
import { dbUserToUser, listPipelineLeads } from '$lib/server/db/leads';
import { isManagerRole } from '$lib/utils/permissions';
import { sessionToUser } from '$lib/server/db/users';

// Manager-only: this roster doubles as the magic-link allowlist (active reps with email).
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !isManagerRole(locals.user.role)) {
		error(403, 'Manager only');
	}

	// No pagination — team rosters are small. Fetch all rows in a stable base
	// order (active first, then name); each /team section owns its own
	// client-side sort state independently (see +page.svelte).
	const [rows, { leads }] = await Promise.all([
		db.select().from(crmUsers).orderBy(desc(crmUsers.active), asc(crmUsers.name), asc(crmUsers.id)),
		listPipelineLeads()
	]);

	const users = rows.map(dbUserToUser).map((u) => ({
		...u,
		leadCount: leads.filter((l) => l.ownerId === u.id).length
	}));

	// One query, one partition pass — the crm_user_role enum is exactly these 3
	// values, so the partition is exhaustive.
	const superManager = users.filter((u) => u.role === 'super_manager');
	const managers = users.filter((u) => u.role === 'manager');
	const reps = users.filter((u) => u.role === 'rep');

	const currentUser = sessionToUser(locals.user!);

	return {
		superManager,
		managers,
		reps,
		leads,
		currentUser
	};
};
