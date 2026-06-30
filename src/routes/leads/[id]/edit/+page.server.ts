import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getLead } from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id);
	if (!lead) throw error(404, 'Lead not found');

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	if (!canEditLead(me, lead)) throw error(403, 'Forbidden');

	return { lead, me };
};
