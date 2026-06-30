#!/usr/bin/env bun
// Hard-purge CRM leads where name='direct' and source='scraper', plus all
// dependent rows in crm_activities and crm_lead_history (CASCADE deletes).
// Does NOT touch crm_users or any Better Auth tables.
//
// Usage:
//   bun scripts/purge-direct-leads.ts             # dry run — counts only
//   bun scripts/purge-direct-leads.ts --execute   # live delete

const isDryRun = !process.argv.includes('--execute');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const postgres = (await import('postgres')).default;
const sql = postgres(url, { max: 1 });

try {
	// Preview: count what would be deleted and show dependent rows
	const [leadCount] = await sql`
		SELECT COUNT(*)::int AS n FROM crm_leads
		WHERE name = 'direct' AND source = 'scraper'
	`;
	console.log(`crm_leads matching (name='direct', source='scraper'): ${leadCount.n}`);

	if (leadCount.n === 0) {
		console.log('Nothing to delete.');
		process.exit(0);
	}

	const [actCount] = await sql`
		SELECT COUNT(*)::int AS n FROM crm_activities a
		JOIN crm_leads l ON l.id = a.lead_id
		WHERE l.name = 'direct' AND l.source = 'scraper'
	`;
	const [histCount] = await sql`
		SELECT COUNT(*)::int AS n FROM crm_lead_history h
		JOIN crm_leads l ON l.id = h.lead_id
		WHERE l.name = 'direct' AND l.source = 'scraper'
	`;
	console.log(`  → crm_activities to cascade-delete : ${actCount.n}`);
	console.log(`  → crm_lead_history to cascade-delete: ${histCount.n}`);

	if (isDryRun) {
		console.log('\nDry run — pass --execute to delete.');
		process.exit(0);
	}

	const deleted = await sql`
		DELETE FROM crm_leads
		WHERE name = 'direct' AND source = 'scraper'
		RETURNING id
	`;
	console.log(`\nDeleted ${deleted.length} crm_leads rows (activities + history cascaded).`);
} finally {
	await sql.end();
}
