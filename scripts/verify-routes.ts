/**
 * Verify that every DB query used by the 500-failing routes succeeds.
 * Usage: bun scripts/verify-routes.ts
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, isNull, and, ne, isNotNull, eq } from 'drizzle-orm';
import { crmLeads, crmActivities, crmUsers } from '../src/lib/server/db/schema.ts';

const url = process.env.DATABASE_URL ?? 'postgres://crm:crm@127.0.0.1:5432/veent_crm';
const client = postgres(url, { max: 1 });
const db = drizzle(client);

const MANAGER_ID = '00000000-0000-0000-0000-000000000001';

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<unknown>) {
	try {
		const result = await fn();
		const count = Array.isArray(result) ? result.length : JSON.stringify(result);
		console.log(`✓ ${name} (${count})`);
		passed++;
	} catch (e) {
		console.error(`✗ ${name}`);
		console.error('  ', (e as Error).message?.slice(0, 400));
		failed++;
	}
}

// / and /api/nav-counts — getTodayQueue
await check('getTodayQueue (/ and /api/nav-counts)', () =>
	db
		.select()
		.from(crmLeads)
		.where(
			and(
				isNull(crmLeads.deletedAt),
				eq(crmLeads.ownerId, MANAGER_ID),
				ne(crmLeads.stage, 'won'),
				ne(crmLeads.stage, 'lost')
			)
		)
		.orderBy(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt}) desc`)
);

// /leads and /pipeline — listLeads
await check('listLeads (/leads and /pipeline)', () =>
	db
		.select()
		.from(crmLeads)
		.where(isNull(crmLeads.deletedAt))
		.orderBy(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt}) desc`)
);

// /reminders — join crm_activities + crm_leads
await check('reminders query (/reminders)', () =>
	db
		.select()
		.from(crmActivities)
		.innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
		.where(and(isNotNull(crmActivities.followUpAt), isNull(crmLeads.deletedAt)))
		.orderBy(crmActivities.followUpAt)
);

// /unassigned count
await check('unassigned badge (/unassigned)', () =>
	db
		.select({ count: sql<number>`COUNT(*)` })
		.from(crmLeads)
		.where(
			and(
				isNull(crmLeads.ownerId),
				isNull(crmLeads.deletedAt),
				ne(crmLeads.stage, 'won'),
				ne(crmLeads.stage, 'lost')
			)
		)
);

// /review count
await check('review badge (/review)', () =>
	db
		.select({ count: sql<number>`COUNT(*)` })
		.from(crmLeads)
		.where(and(eq(crmLeads.needsReview, true), isNull(crmLeads.deletedAt)))
);

// /team
await check('listUsers (/team)', () => db.select().from(crmUsers).orderBy(crmUsers.name));

// source_ref column (added by migration 0006)
await check(
	'source_ref column exists on crm_leads',
	() => client`SELECT source_ref FROM crm_leads LIMIT 1`
);

// scraped_event enum value (added by migration 0004)
await check(
	'scraped_event enum value in crm_activity_channel',
	() => client`SELECT 'scraped_event'::crm_activity_channel`
);

// scraper columns on crm_activities (added by migration 0004)
await check(
	'scraper columns on crm_activities (event_name, event_url, etc)',
	() =>
		client`SELECT event_name, event_date, event_url, event_category, event_source FROM crm_activities LIMIT 1`
);

await client.end();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
