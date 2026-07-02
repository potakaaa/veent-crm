import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activityFormSchema } from '$lib/zod/schemas';
import { getLead, insertActivity } from '$lib/server/db/leads';

// POST /api/leads/[id]/activities -- log an outreach touch.
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (body === null || typeof body !== 'object') {
		return json({ error: 'invalid', issues: [] }, { status: 400 });
	}

	const parsed = activityFormSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
	}

	if (parsed.data.leadId !== params.id) {
		return json(
			{ error: 'invalid', issues: [{ message: 'leadId does not match route' }] },
			{ status: 400 }
		);
	}

	const lead = await getLead(params.id, locals.user.id, locals.user.role);
	if (!lead) return json({ error: 'not found' }, { status: 404 });
	if (locals.user.role === 'rep' && lead.ownerId !== locals.user.id) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const rawDays = (body as Record<string, unknown>).followUpInDays;
	if (rawDays != null && !(typeof rawDays === 'number' && Number.isFinite(rawDays))) {
		return json(
			{ error: 'invalid', issues: [{ message: 'followUpInDays must be a finite number' }] },
			{ status: 400 }
		);
	}
	const followUpInDays = rawDays as number | undefined;

	if (parsed.data.occurredAt && Number.isNaN(new Date(parsed.data.occurredAt).getTime())) {
		return json(
			{ error: 'invalid', issues: [{ message: 'occurredAt is not a valid date' }] },
			{ status: 400 }
		);
	}
	if (parsed.data.followUpAt && Number.isNaN(new Date(parsed.data.followUpAt).getTime())) {
		return json(
			{ error: 'invalid', issues: [{ message: 'followUpAt is not a valid date' }] },
			{ status: 400 }
		);
	}

	const activity = await insertActivity({
		leadId: parsed.data.leadId,
		repId: locals.user.id,
		channel: parsed.data.channel,
		outcome: parsed.data.outcome,
		occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
		followUpAt: parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : undefined,
		followUpInDays,
		notes: parsed.data.notes
	});

	if (activity === null) {
		return json({ error: 'duplicate' }, { status: 409 });
	}

	return json({ activity }, { status: 201 });
};
