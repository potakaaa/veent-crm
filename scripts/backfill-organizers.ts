#!/usr/bin/env bun
/**
 * backfill-organizers.ts — one-time, idempotent backfill of organizer links on existing leads.
 *
 * For every non-deleted lead with no organizerId, resolve (find-or-create) an organizer from
 * the lead's own fields via the shared findOrCreateOrganizer() and set the FK. Idempotent by
 * construction: it only ever selects `organizer_id IS NULL` rows, so a second run is a no-op.
 * Leads with no derivable normalizedHandle are skipped and counted (AC8).
 *
 * Uses a standalone postgres()+drizzle() client (NOT the shared $lib/server/db/index client) —
 * that client imports $env/dynamic/private, which does not resolve under plain `bun run`.
 * findOrCreateOrganizer lives in organizer-find-or-create.ts precisely so it can be imported
 * here with zero $env dependency.
 *
 * Usage:
 *   bun run scripts/backfill-organizers.ts --dry-run   # report only, no writes
 *   bun run scripts/backfill-organizers.ts --load      # apply links (requires DATABASE_URL)
 */

const dryRun = process.argv.includes('--dry-run');
const load = process.argv.includes('--load');

if (dryRun && load) {
	console.error('--dry-run and --load are mutually exclusive');
	process.exit(1);
}
if (!dryRun && !load) {
	console.error('Pass --dry-run or --load');
	process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const postgres = (await import('postgres')).default;
const { drizzle } = await import('drizzle-orm/postgres-js');
const { and, eq, isNull, count } = await import('drizzle-orm');
const schema = await import('../src/lib/server/db/schema');
const { findOrCreateOrganizer } = await import('../src/lib/server/db/organizer-find-or-create');
const { crmLeads, crmOrganizers } = schema;

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

try {
	// Count organizers before/after so we can report "organizers created" without changing
	// findOrCreateOrganizer's public return shape (the ingest caller only needs the id).
	const [{ value: orgCountBefore }] = await db.select({ value: count() }).from(crmOrganizers);

	const leads = await db
		.select({
			id: crmLeads.id,
			normalizedHandle: crmLeads.normalizedHandle,
			name: crmLeads.name,
			socialFacebook: crmLeads.socialFacebook,
			socialInstagram: crmLeads.socialInstagram,
			pageUrl: crmLeads.pageUrl,
			location: crmLeads.location,
			contactEmail: crmLeads.contactEmail,
			contactPhone: crmLeads.contactPhone
		})
		.from(crmLeads)
		.where(and(isNull(crmLeads.organizerId), isNull(crmLeads.deletedAt)));

	console.log(`${leads.length} lead(s) without an organizer link`);

	let linked = 0;
	let skipped = 0;
	// Dry-run only: distinct normalizedHandles that resolved to no existing organizer (a real
	// --load run would create exactly one row per distinct handle). Deduped so multiple leads
	// sharing a handle count as one "would create".
	const wouldCreateHandles = new Set<string>();

	for (const row of leads) {
		if (!row.normalizedHandle) {
			// AC8: no derivable handle → skip + count, never call findOrCreateOrganizer.
			skipped++;
			continue;
		}

		const organizerId = await findOrCreateOrganizer(
			{
				normalizedHandle: row.normalizedHandle,
				name: row.name,
				socialFacebook: row.socialFacebook,
				socialInstagram: row.socialInstagram,
				website: row.pageUrl,
				email: row.contactEmail,
				phone: row.contactPhone,
				location: row.location
			},
			db,
			{ dryRun }
		);

		if (dryRun && organizerId === null) {
			// Dry-run + no existing organizer → a --load run would create one. Dedupe by handle.
			wouldCreateHandles.add(row.normalizedHandle.toLowerCase());
		}

		if (load) {
			await db
				.update(crmLeads)
				.set({ organizerId, updatedAt: new Date() })
				.where(eq(crmLeads.id, row.id));
		}
		linked++;
	}

	const [{ value: orgCountAfter }] = await db.select({ value: count() }).from(crmOrganizers);
	// --load: real writes happened → before/after diff. --dry-run: zero writes → deduped count.
	const organizersCreated = dryRun ? wouldCreateHandles.size : orgCountAfter - orgCountBefore;

	console.log(
		`${dryRun ? '[dry-run] would link' : 'Linked'} ${linked} lead(s), ${organizersCreated} organizer(s) created, ${skipped} skipped`
	);
} finally {
	await client.end();
}
