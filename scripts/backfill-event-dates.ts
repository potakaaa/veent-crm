#!/usr/bin/env bun
// Backfills scraper_org_id + event_date on existing CRM leads.
//
// Strategy: match CRM leads to Neon organizers via event_link URL.
// CRM event_link = Neon events_event.url (the event source URL from the scraper).
// Once the organizer is identified we can reliably get their event dates forever.
//
// Usage:
//   bun run scripts/backfill-event-dates.ts --dry-run
//   bun run scripts/backfill-event-dates.ts --load

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

const SCRAPER_URL = process.env.SCRAPER_DATABASE_URL;
if (!SCRAPER_URL) throw new Error('SCRAPER_DATABASE_URL is required');

const postgres = (await import('postgres')).default;
const { drizzle } = await import('drizzle-orm/postgres-js');
const { eq, isNull, isNotNull } = await import('drizzle-orm');
const schema = await import('../src/lib/server/db/schema');

const crmUrl = process.env.DATABASE_URL;
if (!crmUrl) throw new Error('DATABASE_URL is required');

const scraperClient = postgres(SCRAPER_URL, { max: 1 });
const crmClient = postgres(crmUrl, { max: 1 });
const db = drizzle(crmClient, { schema });
const { crmLeads } = schema;

// All CRM leads that still need an org ID
const leads = await db
	.select({
		id: crmLeads.id,
		eventLink: crmLeads.eventLink,
		normalizedHandle: crmLeads.normalizedHandle,
		scraperOrgId: crmLeads.scraperOrgId
	})
	.from(crmLeads)
	.where(isNull(crmLeads.scraperOrgId));

console.log(`${leads.length} leads without scraperOrgId`);

// Build a map: event_url (lowercase) → { org_id, best_event_date }
// "best" = soonest upcoming, else most recent past
const neonRows = await scraperClient<
	{ url: string; organizer_ref_id: number; event_date: string }[]
>`
	SELECT
		lower(e.url) AS url,
		e.organizer_ref_id,
		to_char(
			(
				SELECT e2.starts_at FROM events_event e2
				WHERE e2.organizer_ref_id = e.organizer_ref_id AND e2.starts_at IS NOT NULL
				ORDER BY
					CASE WHEN e2.starts_at >= CURRENT_DATE THEN 0 ELSE 1 END,
					CASE WHEN e2.starts_at >= CURRENT_DATE THEN e2.starts_at END ASC,
					e2.starts_at DESC
				LIMIT 1
			),
			'YYYY-MM-DD'
		) AS event_date
	FROM events_event e
	WHERE e.organizer_ref_id IS NOT NULL AND e.url IS NOT NULL AND e.url != ''
`;

const byUrl = new Map<string, { orgId: number; eventDate: string | null }>();
for (const r of neonRows) {
	if (r.url && !byUrl.has(r.url)) {
		byUrl.set(r.url, { orgId: r.organizer_ref_id, eventDate: r.event_date });
	}
}

console.log(`${byUrl.size} distinct event URLs in Neon`);

let updated = 0;
let unresolvable = 0;

for (const lead of leads) {
	const key = lead.eventLink?.toLowerCase();
	const match = key ? byUrl.get(key) : undefined;

	if (!match) {
		unresolvable++;
		continue;
	}

	console.log(`  ${lead.normalizedHandle}: org=${match.orgId} date=${match.eventDate ?? 'none'}`);

	if (load) {
		await db
			.update(crmLeads)
			.set({
				scraperOrgId: match.orgId,
				eventDate: match.eventDate ?? null,
				updatedAt: new Date()
			})
			.where(eq(crmLeads.id, lead.id));
	}
	updated++;
}

console.log(
	`\n${dryRun ? '[dry-run] would update' : 'Updated'}: ${updated}, unresolvable: ${unresolvable}`
);

await scraperClient.end();
await crmClient.end();
