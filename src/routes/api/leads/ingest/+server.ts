import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ingestBatchSchema } from '$lib/zod/schemas';

// Future scraper intake (designed, NOT in the v1 build — see sales-crm.md §Lead ingestion).
// Secret-authed (INGEST_SECRET); the scraper never gets DATABASE_URL. The CRM owns validation +
// dedup-at-the-door (normalized_handle): match = skip / attach as advisory sibling, never blind-create.
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.INGEST_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (secret && provided !== secret) throw error(401, 'unauthorized');

	const parsed = ingestBatchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'invalid payload');

	// STUB: real impl runs the dedup gate, validate+normalize, then route to pool or review queue.
	return json({
		received: parsed.data.leads.length,
		created: 0,
		skipped: 0,
		review: 0,
		stub: true
	});
};
