import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { leadFormSchema } from '$lib/zod/schemas';
import { createLead, listLeadsFiltered } from '$lib/server/db/leads';

/**
 * Session-scoped lead search for the meetings LeadCombobox.
 * SECURITY (AC4): userId/role/segment are derived ONLY from `locals.user` and the
 * server-hardcoded `segment: 'all'`. Client-supplied `?userId=`, `?role=`, `?segment=`
 * are NEVER read — only `q` (search term) and `page` are trusted, and only for
 * search/pagination. Widening visibility via query params is impossible by construction.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? undefined;
	const page = Number(url.searchParams.get('page')) || 1;

	const { leads, total } = await listLeadsFiltered({
		userId: locals.user.id,
		role: locals.user.role,
		segment: 'all',
		search: q,
		page
	});

	return json({ leads: leads.map((l) => ({ id: l.id, name: l.name })), total });
};

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
			notes: data.notes || undefined,
			visibility: data.visibility,
			selectedUserIds: data.selectedUserIds
		},
		locals.user.id
	);

	return json({ id: lead.id, name: lead.name }, { status: 201 });
};
