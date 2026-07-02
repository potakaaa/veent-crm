#!/usr/bin/env bun
/**
 * backfill-reps.ts — Insert crm_users rows for reps identified in the historical spreadsheet.
 *
 * These are the team members whose names appear in the "Reached Out By" / "Attendee"
 * columns of the Events and Meeting CSVs. Adding them here allows the import-sheet
 * script's rep-mapping prompt to resolve nicknames to real user IDs.
 *
 * Emails use @test.com placeholders. Update to real emails before going live so
 * reps can receive magic-link login emails.
 *
 * Idempotent: uses onConflictDoNothing on email — safe to re-run.
 *
 * Usage:
 *   bun scripts/backfill-reps.ts            # dry-run: print the rows, no DB
 *   bun scripts/backfill-reps.ts --load     # insert into DB (requires DATABASE_URL)
 */

export type RepRow = {
	name: string;
	email: string;
	role: 'rep' | 'manager';
};

// ---------------------------------------------------------------------------
// Rep roster (from Events.csv "Reached Out By" + Meeting.csv "Attendee" columns)
//
// Full names taken from Meeting.csv where available.
// "Elay" and "Jonna" both appear as separate authors in Events.csv — kept as
// separate entries until confirmed otherwise. Update names/emails as needed.
// ---------------------------------------------------------------------------
export const REPS: RepRow[] = [
	// Full names confirmed from Meeting.csv
	// "Jonna" in the events sheet = Jonnavien Grace Asuelo
	{ name: 'Jonnavien', email: 'jonna@test.com', role: 'rep' },
	{ name: 'Divine', email: 'divine@test.com', role: 'rep' },
	{ name: 'Jela', email: 'jela@test.com', role: 'rep' },
	{ name: 'Ethyl', email: 'ethyl@test.com', role: 'rep' },
	{ name: 'Elay', email: 'elay@test.com', role: 'rep' },
	{ name: 'Angel', email: 'angel@test.com', role: 'rep' },
	{ name: 'Dhen', email: 'dhen@test.com', role: 'rep' },
	{ name: 'Fatima', email: 'fatima@test.com', role: 'rep' }
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (import.meta.main) {
	const isLoad = process.argv.includes('--load');

	console.log(`\n=== Rep roster (${REPS.length} users) ===\n`);
	console.table(REPS);

	if (!isLoad) {
		console.log('\n(dry-run: pass --load to insert into DB)');
		process.exit(0);
	}

	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is required for --load');
		process.exit(1);
	}

	const postgres = (await import('postgres')).default;
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const { crmUsers } = await import('../src/lib/server/db/schema.js');

	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema: { crmUsers } });

	try {
		const result = await db
			.insert(crmUsers)
			.values(
				REPS.map((r) => ({
					name: r.name,
					email: r.email,
					role: r.role,
					active: true
				}))
			)
			.onConflictDoNothing()
			.returning({ id: crmUsers.id, name: crmUsers.name, email: crmUsers.email });

		console.log(
			`\nInserted ${result.length} user(s) (${REPS.length - result.length} already existed)`
		);
		if (result.length) console.table(result);
	} finally {
		await client.end();
	}
}
