import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { leadFormSchema } from '$lib/zod/schemas';
import { createLead } from '$lib/server/db/leads';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = leadFormSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
		throw error(400, msg);
	}

	const { data } = parsed;
	const lead = await createLead(
		{
			name: data.name,
			category: data.category,
			platform: data.platform,
			location: data.location || undefined,
			pageUrl: data.pageUrl || undefined,
			contactEmail: data.contactEmail || undefined,
			eventName: data.eventName || undefined,
			eventLink: data.eventLink || undefined,
			eventDateRaw: data.eventDateRaw || undefined,
			firstAnnouncedDate: data.firstAnnouncedDate || undefined,
			firstReachedOutDate: data.firstReachedOutDate || undefined,
			notes: data.notes || undefined
		},
		locals.user.id
	);

	return json({ id: lead.id, name: lead.name }, { status: 201 });
};
