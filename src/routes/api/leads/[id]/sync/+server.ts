import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLead } from '$lib/server/db/leads';
import { syncLeadDatesToNextcloud } from '$lib/server/n8n/calendar-sync';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const lead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!lead) throw error(404, 'Lead not found');

	try {
		// For manual sync, "prev" values equal the current values — this forces a
		// create-or-update on all set date fields regardless of whether they changed.
		await syncLeadDatesToNextcloud(lead, {
			goLiveDate: lead.goLiveDate ?? null,
			eventDate: lead.eventDate ?? null,
			nextcloudGoLiveUid: lead.nextcloudGoLiveUid ?? null,
			nextcloudEventUid: lead.nextcloudEventUid ?? null
		});
		return json({ success: true });
	} catch (e) {
		console.error('[NCAL-3] manual lead sync failed:', e);
		return json({ success: false, error: 'Calendar sync failed' }, { status: 502 });
	}
};
