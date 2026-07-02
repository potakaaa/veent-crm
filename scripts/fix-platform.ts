#!/usr/bin/env bun
// One-shot backfill: re-derives platform for leads where platform is NULL or 'Other'
// using the same URL-priority logic as normalizePlatform (social_facebook > social_instagram
// > event_link > page_url). Idempotent — safe to re-run.
//
// Usage:
//   bun run scripts/fix-platform.ts --dry-run    # show what would change, no writes
//   bun run scripts/fix-platform.ts --load       # apply updates

import { normalizePlatform } from '../src/lib/server/import-utils';

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

const postgres = (await import('postgres')).default;
const { drizzle } = await import('drizzle-orm/postgres-js');
const { isNull, or, eq, isNotNull, and } = await import('drizzle-orm');
const schema = await import('../src/lib/server/db/schema');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });
const { crmLeads } = schema;

// Fetch all leads with null or 'Other' platform that aren't deleted.
const leads = await db
	.select({
		id: crmLeads.id,
		platform: crmLeads.platform,
		socialFacebook: crmLeads.socialFacebook,
		socialInstagram: crmLeads.socialInstagram,
		eventLink: crmLeads.eventLink,
		pageUrl: crmLeads.pageUrl
	})
	.from(crmLeads)
	.where(
		and(or(isNull(crmLeads.platform), eq(crmLeads.platform, 'Other')), isNull(crmLeads.deletedAt))
	);

console.log(`Found ${leads.length} leads with null/Other platform`);

let updated = 0;
let unchanged = 0;

for (const lead of leads) {
	// Derive platform: social URLs first, then event link, then page URL as last resort.
	// page_url is the organizer's website — lower confidence but better than nothing.
	const derived =
		normalizePlatform(
			lead.socialFacebook ?? undefined,
			lead.socialInstagram ?? undefined,
			lead.eventLink ?? undefined
		) ?? normalizePlatform(undefined, undefined, lead.pageUrl ?? undefined);

	if (!derived || derived === lead.platform) {
		unchanged++;
		continue;
	}

	console.log(
		`  ${lead.id}: ${lead.platform ?? 'null'} → ${derived}  (fb=${lead.socialFacebook} ig=${lead.socialInstagram} event=${lead.eventLink} page=${lead.pageUrl})`
	);

	if (load) {
		await db
			.update(crmLeads)
			.set({ platform: derived, updatedAt: new Date() })
			.where(eq(crmLeads.id, lead.id));
	}

	updated++;
}

console.log(
	`\n${dryRun ? '[dry-run] would update' : 'Updated'}: ${updated}, unchanged/unresolvable: ${unchanged}`
);

await client.end();
