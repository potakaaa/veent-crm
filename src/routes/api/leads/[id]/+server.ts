import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { leadUpdateSchema } from '$lib/zod/schemas';
import { getLead, updateLead } from '$lib/server/db/leads';
import { canEditLead } from '$lib/utils/permissions';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = leadUpdateSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const existing = await getLead(params.id);
	if (!existing) throw error(404, 'Lead not found');

	const me = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};
	if (!canEditLead(me, existing)) throw error(403, 'Forbidden');

	const { data } = parsed;
	const lead = await updateLead(
		params.id,
		{
			name: data.name,
			category: data.category,
			platform: data.platform,
			location: data.location || undefined,
			pageUrl: data.pageUrl || undefined,
			contactEmail: data.contactEmail || undefined,
			contactPhone: data.phone || undefined,
			socialFacebook: data.socialFacebook || undefined,
			socialInstagram: data.socialInstagram || undefined,
			eventName: data.eventName || undefined,
			eventDate: data.eventDate || undefined,
			eventDateRaw: data.eventDateRaw || undefined,
			eventLink: data.eventLink || undefined,
			firstAnnouncedDate: data.firstAnnouncedDate || undefined,
			firstReachedOutDate: data.firstReachedOutDate || undefined,
			notes: data.notes || undefined
		},
		locals.user.id
	);

	if (!lead) throw error(404, 'Lead not found');
	return json({ id: lead.id, name: lead.name });
};
