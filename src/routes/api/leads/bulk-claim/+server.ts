import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimLead } from '$lib/server/db/leads';
import { z } from 'zod';

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid payload');

	const results = await Promise.all(parsed.data.ids.map((id) => claimLead(id, locals.user!.id)));

	const claimed = results.filter(Boolean).length;
	return json({ claimed });
};
