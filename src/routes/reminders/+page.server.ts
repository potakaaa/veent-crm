import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { crmActivities, crmLeads } from '$lib/server/db/schema';
import { and, asc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { dbRowToLead } from '$lib/server/db/leads';
import type { Lead } from '$lib/types';

// Reminders — the current user's pending future follow-ups, sorted ascending.
// The page (reminders/+page.svelte) consumes `data.leads` (Lead[]) grouped by urgency,
// so each row is mapped via dbRowToLead with its booked follow_up_at.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const rows = await db
		.select({ lead: crmLeads, followUpAt: crmActivities.followUpAt })
		.from(crmActivities)
		.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
		.where(
			and(
				isNotNull(crmActivities.followUpAt),
				gte(crmActivities.followUpAt, new Date()),
				eq(crmActivities.repId, locals.user.id),
				isNull(crmLeads.deletedAt)
			)
		)
		.orderBy(asc(crmActivities.followUpAt));

	const leads: Lead[] = rows.map((r) => dbRowToLead(r.lead, r.followUpAt));

	return { leads };
};
