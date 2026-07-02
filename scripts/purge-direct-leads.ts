#!/usr/bin/env bun
// Hard-purge CRM leads where name='direct' and source='scraper', plus all
// dependent rows in crm_activities and crm_lead_history (CASCADE deletes).
// Does NOT touch crm_users or any Better Auth tables.
//
// Usage:
//   bun scripts/purge-direct-leads.ts                        # dry run — counts only
//   bun scripts/purge-direct-leads.ts --execute --confirmed  # live delete

const argv = process.argv;
const isDryRun = !argv.includes('--execute');
const isConfirmed = argv.includes('--confirmed');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Safety gate: --execute requires --confirmed and a non-production DATABASE_URL.
if (!isDryRun) {
	if (!isConfirmed) {
		console.error('ERROR: --execute requires --confirmed. Re-run with both flags to proceed.');
		process.exit(1);
	}
	if (/neon\.tech|supabase\.co|prod/i.test(url)) {
		console.error('ERROR: DATABASE_URL looks like a production database. Aborting.');
		process.exit(1);
	}
}

const postgres = (await import('postgres')).default;
const sql = postgres(url, { max: 1 });

async function run() {
	// Materialize candidate IDs once so counts and DELETE operate on the exact
	// same rows — no predicate re-evaluation drift between the preview and delete.
	const candidates = await sql<{ id: string }[]>`
		SELECT id FROM crm_leads
		WHERE name = 'direct' AND source = 'scraper'
	`;

	console.log(`crm_leads matching (name='direct', source='scraper'): ${candidates.length}`);

	if (candidates.length === 0) {
		console.log('Nothing to delete.');
		return;
	}

	const ids = candidates.map((r) => r.id);

	const [actCount] = await sql`
		SELECT COUNT(*)::int AS n FROM crm_activities WHERE lead_id = ANY(${ids})
	`;
	const [histCount] = await sql`
		SELECT COUNT(*)::int AS n FROM crm_lead_history WHERE lead_id = ANY(${ids})
	`;
	console.log(`  → crm_activities to cascade-delete : ${actCount.n}`);
	console.log(`  → crm_lead_history to cascade-delete: ${histCount.n}`);

	if (isDryRun) {
		console.log('\nDry run — pass --execute --confirmed to delete.');
		return;
	}

	const deleted = await sql`
		DELETE FROM crm_leads WHERE id = ANY(${ids}) RETURNING id
	`;
	console.log(`\nDeleted ${deleted.length} crm_leads rows (activities + history cascaded).`);
}

try {
	await run();
} finally {
	await sql.end();
}
