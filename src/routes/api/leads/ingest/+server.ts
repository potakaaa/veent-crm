import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { and, eq, isNull } from 'drizzle-orm';
import { ingestBatchSchema } from '$lib/zod/schemas';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { findOrCreateOrganizer } from '$lib/server/db/organizer-find-or-create';
import {
	normalizeHandle,
	normalizePlatform,
	normalizeCountry,
	parseCountryFromLocation
} from '$lib/server/import-utils';

// Scraper intake. Secret-authed (INGEST_SECRET); the scraper never gets DATABASE_URL. The CRM
// owns validation + dedup-at-the-door (normalized_handle): match = skip, never blind-create.
// All ingested leads land unassigned (owner_id NULL), source='scraper'.
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.INGEST_SECRET;
	if (!secret) throw error(500, 'server misconfigured');
	const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (provided !== secret) throw error(401, 'unauthorized');

	const parsed = ingestBatchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'invalid payload');

	let created = 0;
	let skipped = 0;
	let patched = 0;

	for (const lead of parsed.data.leads) {
		// Normalize handle for dedup: prefer an explicit handle, else derive from url/pageName.
		const normalizedHandle = lead.handle
			? lead.handle.toLowerCase().replace(/[^a-z0-9-]/g, '')
			: normalizeHandle(lead.url, undefined, undefined, lead.pageName);

		// Dedup: if scraper provides a sourceRef (event ID), use it as the unique key.
		// Otherwise fall back to normalizedHandle (covers manually-created leads).
		const dupHit = await db
			.select({ id: crmLeads.id, country: crmLeads.country })
			.from(crmLeads)
			.where(
				lead.sourceRef
					? and(eq(crmLeads.sourceRef, lead.sourceRef), isNull(crmLeads.deletedAt))
					: and(eq(crmLeads.normalizedHandle, normalizedHandle), isNull(crmLeads.deletedAt))
			)
			.limit(1);

		if (dupHit.length) {
			// Backfill country on existing leads that pre-date the country column.
			const incomingCountry = normalizeCountry(parseCountryFromLocation(lead.location));
			if (incomingCountry && dupHit[0].country == null) {
				const updated = await db
					.update(crmLeads)
					.set({ country: incomingCountry, updatedAt: new Date() })
					.where(and(eq(crmLeads.id, dupHit[0].id), isNull(crmLeads.country)))
					.returning({ id: crmLeads.id });
				if (updated.length > 0) {
					patched++;
				} else {
					skipped++;
				}
			} else {
				skipped++;
			}
			continue;
		}

		// The ingest payload already carries a typed CRM category enum, so it is used as-is.
		// (mapCategory is for raw scraper strings in the bulk-file path; mapping a valid enum
		// value here would wrongly demote categories absent from the scraper map, e.g. Camp.)
		// Best-effort organizer linkage: resolve/create the organizer FIRST, then insert the
		// lead with organizerId set. A failure here must NOT block lead creation (response
		// contract unchanged) — log and continue with organizerId null.
		let organizerId: string | null = null;
		try {
			organizerId = await findOrCreateOrganizer(
				{
					normalizedHandle,
					name: lead.pageName,
					socialFacebook: lead.facebookUrl ?? null,
					socialInstagram: lead.instagramUrl ?? null,
					website: lead.url ?? null,
					email: lead.email ?? null,
					phone: lead.phone ?? null,
					location: lead.location ?? null
				},
				db
			);
		} catch (e) {
			console.error('findOrCreateOrganizer failed, continuing without organizer link', e);
		}

		const now = new Date();
		await db.insert(crmLeads).values({
			name: lead.pageName,
			normalizedHandle,
			organizerId,
			sourceRef: lead.sourceRef ?? null,
			scraperOrgId: lead.scraperOrgId ?? null,
			// NOTE(CAT-1): crm_leads.category column dropped in migration 0028. Ingested leads no
			// longer set a category on insert; join-row backfill for ingest is deferred (SPEC Out of Scope).
			platform:
				lead.platform && lead.platform !== 'Other'
					? lead.platform
					: (normalizePlatform(lead.facebookUrl, lead.instagramUrl, lead.eventLink ?? undefined) ??
						normalizePlatform(undefined, undefined, lead.url ?? undefined) ??
						null),
			location: lead.location ?? null,
			country: normalizeCountry(parseCountryFromLocation(lead.location)),
			pageUrl: lead.url ?? null,
			socialFacebook: lead.facebookUrl ?? null,
			socialInstagram: lead.instagramUrl ?? null,
			contactEmail: lead.email ?? null,
			contactPhone: lead.phone ?? null,
			eventName: lead.eventName ?? null,
			eventDate: lead.eventDate ?? null,
			eventLink: lead.eventLink ?? null,
			firstAnnouncedDate: lead.firstAnnouncedDate ?? null,
			source: 'scraper',
			stage: 'new',
			ownerId: null,
			createdAt: now,
			updatedAt: now
		});
		created++;
	}

	return json({ received: parsed.data.leads.length, created, skipped, patched });
};
