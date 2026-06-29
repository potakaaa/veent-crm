import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { crmActivities, crmLeads } from '$lib/server/db/schema';
import { isNotNull, isNull, max } from 'drizzle-orm';
import { dbRowToLead } from '$lib/server/db/leads';
import type { Lead, User } from '$lib/types';

// Today view — due / overdue / replied / cold queue, driven by real DB data.
// follow_up_at lives on crm_activities (NOT crm_leads), so we join the latest booked
// follow-up per lead and feed it to dbRowToLead so urgency (Asia/Manila) is correct.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const [rows, followUps] = await Promise.all([
		db.select().from(crmLeads).where(isNull(crmLeads.deletedAt)),
		db
			.select({ leadId: crmActivities.leadId, latest: max(crmActivities.followUpAt) })
			.from(crmActivities)
			.where(isNotNull(crmActivities.followUpAt))
			.groupBy(crmActivities.leadId)
	]);

	const followUpByLead = new Map(followUps.map((f) => [f.leadId, f.latest]));

	const leads: Lead[] = rows
		.map((row) => dbRowToLead(row, followUpByLead.get(row.id) ?? undefined))
		.filter(
			(l) =>
				l.urgency === 'overdue' ||
				l.urgency === 'due' ||
				l.urgency === 'replied' ||
				l.urgency === 'cold'
		);

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { leads, me };
};
