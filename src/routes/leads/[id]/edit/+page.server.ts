import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getLead, listUsers, getLeadVisibilityGrants } from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [lead, users, selectedUserIds] = await Promise.all([
		getLead(params.id, locals.user.id, locals.user.role),
		listUsers(),
		getLeadVisibilityGrants(params.id)
	]);
	if (!lead) throw error(404, 'Lead not found');

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		firstName: locals.user.firstName,
		lastName: locals.user.lastName,
		role: locals.user.role,
		active: true
	};

	if (!canEditLead(me, lead)) throw error(403, 'Forbidden');

	return { lead: { ...lead, selectedUserIds }, me, users };
};
