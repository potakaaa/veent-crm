import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { crmUsers } from '$lib/server/db/schema';
import { asc, desc } from 'drizzle-orm';
import { dbUserToUser, listPipelineLeads } from '$lib/server/db/leads';
import { canAccessTeam } from '$lib/utils/permissions';
import type { User } from '$lib/types';

const SORT_COLS = ['name', 'email', 'role', 'active'] as const;
type SortCol = (typeof SORT_COLS)[number];

const COL_MAP = {
	name: crmUsers.name,
	email: crmUsers.email,
	role: crmUsers.role,
	active: crmUsers.active
} satisfies Record<SortCol, unknown>;

// Manager-only: this roster doubles as the magic-link allowlist (active reps with email).
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !canAccessTeam(locals.user)) {
		error(403, 'Manager only');
	}

	const rawSort = url.searchParams.get('sort') ?? 'name';
	const sort: SortCol = (SORT_COLS as readonly string[]).includes(rawSort)
		? (rawSort as SortCol)
		: 'name';
	const dir = url.searchParams.get('dir') === 'desc' ? ('desc' as const) : ('asc' as const);
	const fn = dir === 'asc' ? asc : desc;

	const [rows, { leads }] = await Promise.all([
		db.select().from(crmUsers).orderBy(fn(COL_MAP[sort]), asc(crmUsers.id)),
		listPipelineLeads()
	]);

	const users = rows.map(dbUserToUser).map((u) => ({
		...u,
		leadCount: leads.filter((l) => l.ownerId === u.id).length
	}));

	const currentUser: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { users, leads, sort, dir, currentUser };
};
