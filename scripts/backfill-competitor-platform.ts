#!/usr/bin/env bun
/**
 * backfill-competitor-platform.ts — one-time, idempotent backfill of currentPlatform on
 * existing scraped leads where it is NULL.
 *
 * Derives currentPlatform from pageUrl / eventLink using the same inferCurrentPlatform()
 * logic as the live ingest handler. Idempotent: only touches rows where current_platform IS NULL.
 * A second run is a no-op on rows already set.
 *
 * Usage:
 *   bun run scripts/backfill-competitor-platform.ts --dry-run   # report counts only, no writes
 *   bun run scripts/backfill-competitor-platform.ts --load      # apply (requires DATABASE_URL)
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
const { and, eq, isNull } = await import('drizzle-orm');
const schema = await import('../src/lib/server/db/schema');
const { inferCurrentPlatform } = await import('../src/lib/server/import-utils');
const { crmLeads } = schema;

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

try {
	const leads = await db
		.select({
			id: crmLeads.id,
			pageUrl: crmLeads.pageUrl,
			eventLink: crmLeads.eventLink
		})
		.from(crmLeads)
		.where(
			and(
				eq(crmLeads.source, 'scraper'),
				isNull(crmLeads.currentPlatform),
				isNull(crmLeads.deletedAt)
			)
		);

	console.log(`${leads.length} scraped lead(s) with no currentPlatform`);

	const candidates = leads
		.map((l) => ({
			id: l.id,
			derived: inferCurrentPlatform(l.pageUrl, l.eventLink)
		}))
		.filter((l) => l.derived !== null) as { id: string; derived: string }[];

	const skipped = leads.length - candidates.length;

	// Tally by platform for the report.
	const tally: Record<string, number> = {};
	for (const { derived } of candidates) {
		tally[derived] = (tally[derived] ?? 0) + 1;
	}

	console.log(`\nDerivable: ${candidates.length} | Skipped (no match): ${skipped}`);
	for (const [platform, n] of Object.entries(tally).sort()) {
		console.log(`  ${platform}: ${n}`);
	}

	if (dryRun) {
		console.log('\nDry run — no writes.');
		await client.end();
		process.exit(0);
	}

	let updated = 0;
	for (const { id, derived } of candidates) {
		await db
			.update(crmLeads)
			.set({ currentPlatform: derived, updatedAt: new Date() })
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.currentPlatform)));
		updated++;
	}

	console.log(`\nDone — ${updated} lead(s) updated.`);
} finally {
	await client.end();
}
