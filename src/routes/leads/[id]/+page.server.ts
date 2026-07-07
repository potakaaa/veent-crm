import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getLead, listUsers, listActivities, getLeadHistory } from '$lib/server/db/leads';
import { listMeetingsForLead } from '$lib/server/db/meetings';
import { listTemplates } from '$lib/server/db/templates';
import { getOrganizer, listOrganizersWithLeadCount } from '$lib/server/db/organizers';
import { listNotesForLead } from '$lib/server/db/notes';
import { getActiveCategories, getCategoriesForLead } from '$lib/server/db/categories';
import { isManagerRole } from '$lib/utils/permissions';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const [lead, users, templates, organizers] = await Promise.all([
		getLead(params.id, locals.user.id, locals.user.role),
		listUsers(),
		listTemplates(),
		listOrganizersWithLeadCount(locals.user.id, locals.user.role)
	]);

	if (!lead) throw error(404, 'Lead not found');

	// [P1] organizer-name resolution depends on lead.organizerId, so it must run AFTER the
	// first Promise.all resolves and after the not-found guard — but it doesn't depend on
	// activities/meetings/leadHistory, so it runs concurrently with them, not sequentially.
	const [organizer, activities, meetings, leadHistory, notes, assignedCategories, allCategories] =
		await Promise.all([
			lead.organizerId ? getOrganizer(lead.organizerId) : Promise.resolve(null),
			listActivities(lead.id),
			listMeetingsForLead(lead.id),
			getLeadHistory(lead.id),
			listNotesForLead(lead.id),
			getCategoriesForLead(lead.id),
			getActiveCategories()
		]);
	lead.organizerName = organizer?.name;

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return {
		lead,
		activities,
		meetings,
		leadHistory,
		notes,
		me,
		users,
		templates,
		organizers,
		assignedCategories,
		allCategories,
		isManager: isManagerRole(locals.user.role)
	};
};
