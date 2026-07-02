import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listLeads, listUsers } from '$lib/server/db/leads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	// Visibility-scoped (GitHub #87): the create-form dedup advisory only surfaces leads
	// the current rep can already see. A rep will not be warned about duplicates of leads
	// hidden from them — an accepted behavioral change under privacy scoping (E4).
	const [leads, users] = await Promise.all([
		listLeads(locals.user.id, locals.user.role),
		listUsers()
	]);
	return { leads, users };
};
