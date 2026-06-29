import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { and, eq, isNull } from 'drizzle-orm';
import { ingestBatchSchema } from '$lib/zod/schemas';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { normalizeHandle } from '$lib/server/import-utils';

// Scraper intake. Secret-authed (INGEST_SECRET); the scraper never gets DATABASE_URL. The CRM
// owns validation + dedup-at-the-door (normalized_handle): match = skip, never blind-create.
// All ingested leads land unassigned (owner_id NULL), source='scraper', needs_review=true.
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.INGEST_SECRET;
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (secret && provided !== secret) throw error(401, 'unauthorized');

	const parsed = ingestBatchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'invalid payload');

	let created = 0;
	let skipped = 0;
	let review = 0;

	for (const lead of parsed.data.leads) {
		// Normalize handle for dedup: prefer an explicit handle, else derive from url/pageName.
		const normalizedHandle = lead.handle
			? lead.handle.toLowerCase().replace(/[^a-z0-9-]/g, '')
			: normalizeHandle(lead.url, undefined, undefined, lead.pageName);

		// Dedup: if scraper provides a sourceRef (event ID), use it as the unique key.
		// Otherwise fall back to normalizedHandle (covers manually-created leads).
		let duplicate = false;
		if (lead.sourceRef) {
			const hit = await db
				.select({ id: crmLeads.id })
				.from(crmLeads)
				.where(and(eq(crmLeads.sourceRef, lead.sourceRef), isNull(crmLeads.deletedAt)))
				.limit(1);
			duplicate = hit.length > 0;
		} else {
			const hit = await db
				.select({ id: crmLeads.id })
				.from(crmLeads)
				.where(and(eq(crmLeads.normalizedHandle, normalizedHandle), isNull(crmLeads.deletedAt)))
				.limit(1);
			duplicate = hit.length > 0;
		}

		if (duplicate) {
			skipped++;
			continue;
		}

		// The ingest payload already carries a typed CRM category enum, so it is used as-is.
		// (mapCategory is for raw scraper strings in the bulk-file path; mapping a valid enum
		// value here would wrongly demote categories absent from the scraper map, e.g. Camp.)
		const now = new Date();
		await db.insert(crmLeads).values({
			name: lead.pageName,
			normalizedHandle,
			sourceRef: lead.sourceRef ?? null,
			category: lead.category ?? 'Other',
			platform: lead.platform ?? null,
			location: lead.location ?? null,
			pageUrl: lead.url ?? null,
			socialFacebook: lead.facebookUrl ?? null,
			contactEmail: lead.email ?? null,
			eventName: lead.eventName ?? null,
			eventLink: lead.eventLink ?? null,
			source: 'scraper',
			stage: 'new',
			needsReview: true,
			ownerId: null,
			createdAt: now,
			updatedAt: now
		});
		created++;
		review++; // every newly ingested scraper lead needs human review
	}

	return json({ received: parsed.data.leads.length, created, skipped, review });
};
