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

	const existing = await getLead(params.id, locals.user.id, locals.user.role);
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
			firstAnnouncedDate:
				data.firstAnnouncedDate === undefined ? undefined : (data.firstAnnouncedDate ?? null),
			firstReachedOutDate:
				data.firstReachedOutDate === undefined ? undefined : (data.firstReachedOutDate ?? null),
			notes: data.notes || undefined,
			visibility: data.visibility,
			selectedUserIds: data.selectedUserIds,
			// Onboarding fields — forward only when present so a normal edit never wipes them.
			onboardingNotes:
				data.onboardingNotes === undefined ? undefined : (data.onboardingNotes ?? null),
			contractUrl: data.contractUrl === undefined ? undefined : data.contractUrl || null,
			onboardingStartDate:
				data.onboardingStartDate === undefined ? undefined : data.onboardingStartDate || null,
			goLiveDate: data.goLiveDate === undefined ? undefined : data.goLiveDate || null,
			// Agreements fields — forward only when present.
			feeStructure: data.feeStructure === undefined ? undefined : (data.feeStructure ?? null),
			transactionFeePct: data.transactionFeePct,
			convenienceFeePesos: data.convenienceFeePesos,
			serviceFeePct: data.serviceFeePct,
			serviceFeePerTicketPesos: data.serviceFeePerTicketPesos,
			bankChargesAbsorbed: data.bankChargesAbsorbed,
			hasFutureEvents: data.hasFutureEvents
		},
		locals.user.id
	);

	if (!lead) throw error(404, 'Lead not found');
	return json({ id: lead.id, name: lead.name });
};
