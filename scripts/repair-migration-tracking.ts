/**
 * Repair drizzle migration tracking table.
 *
 * The fork DB has all schema applied but __drizzle_migrations is missing entries
 * for migrations that were applied outside drizzle-kit's tracking. This script
 * inserts the missing records so `bun run db:migrate` only runs the truly new ones.
 *
 * IMPORTANT: only pass --up-to <tag> matching the last migration that has actually
 * been applied to the target DB. The script will refuse to track migrations beyond
 * that point so drizzle-kit can apply them properly.
 *
 * Usage:
 *   bun run scripts/repair-migration-tracking.ts --up-to 0007_tan_mongu           # mark 0000–0007 as applied
 *   bun run scripts/repair-migration-tracking.ts --up-to 0007_tan_mongu --dry-run # inspect only
 *   bun run scripts/repair-migration-tracking.ts --dry-run                         # preview without --up-to (marks all)
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import postgres from 'postgres';

// All migrations from journal (idx 0–36)
const ALL_MIGRATIONS = [
	{ idx: 0, tag: '0000_medical_betty_ross', when: 1782373222845 },
	{ idx: 1, tag: '0001_acoustic_malice', when: 1782376448198 },
	{ idx: 2, tag: '0002_pg_trgm', when: 1782376456265 },
	{ idx: 3, tag: '0003_ba_account_unique', when: 1782691505783 },
	{ idx: 4, tag: '0004_first_colleen_wing', when: 1782699539041 },
	{ idx: 5, tag: '0005_many_screwball', when: 1782700933170 },
	{ idx: 6, tag: '0006_shocking_lifeguard', when: 1782708153580 },
	{ idx: 7, tag: '0007_tan_mongu', when: 1782779247353 },
	{ idx: 8, tag: '0008_lovely_doctor_octopus', when: 1782795060961 },
	{ idx: 9, tag: '0009_mushy_vapor', when: 1782881339255 },
	{ idx: 10, tag: '0010_tough_lucky_pierre', when: 1782881486554 },
	{ idx: 11, tag: '0011_previous_spencer_smythe', when: 1782885594507 },
	{ idx: 12, tag: '0012_lethal_caretaker', when: 1782887482061 },
	{ idx: 13, tag: '0013_youthful_virginia_dare', when: 1782950734359 },
	{ idx: 14, tag: '0014_nasty_master_mold', when: 1782952269385 },
	{ idx: 15, tag: '0015_milky_human_fly', when: 1782960225866 },
	{ idx: 16, tag: '0016_message_template_title_uq', when: 1782960225867 },
	{ idx: 17, tag: '0017_super_manager_role', when: 1782960225868 },
	{ idx: 18, tag: '0018_single_super_manager_idx', when: 1782959001000 },
	{ idx: 19, tag: '0019_amusing_eternity', when: 1782959001001 },
	{ idx: 20, tag: '0020_sparkling_felicia_hardy', when: 1783296413614 },
	{ idx: 21, tag: '0021_third_ulik', when: 1783296513832 },
	{ idx: 22, tag: '0022_unknown_sleepwalker', when: 1783296539261 },
	{ idx: 23, tag: '0023_sharp_frightful_four', when: 1783296559797 },
	{ idx: 24, tag: '0024_glamorous_blob', when: 1783298831035 },
	{ idx: 25, tag: '0025_mature_aaron_stack', when: 1783308740036 },
	{ idx: 26, tag: '0026_cat1_add_tables', when: 1783308741036 },
	{ idx: 27, tag: '0027_cat1_data_migrate', when: 1783308742036 },
	{ idx: 28, tag: '0028_cat1_drop_enum_column', when: 1783308743036 },
	{ idx: 29, tag: '0029_cat1_partial_name_idx', when: 1783308744036 },
	{ idx: 30, tag: '0030_careless_captain_britain', when: 1783401304843 },
	{ idx: 31, tag: '0031_nav2_competitor_fields', when: 1783405500000 },
	{ idx: 32, tag: '0032_thick_jamie_braddock', when: 1783403762805 },
	{ idx: 33, tag: '0033_name_split_first_last', when: 1783406000000 },
	{ idx: 34, tag: '0034_user_color', when: 1783407000000 },
	{ idx: 35, tag: '0035_done_stage_revenue', when: 1783408000000 },
	{ idx: 36, tag: '0036_ncal3_uid_columns', when: 1783409000000 }
];

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) console.log('DRY RUN — no writes will be made\n');

// --up-to <tag> limits which migrations are considered applied. Migrations after
// this tag are left untracked so drizzle-kit applies them normally.
const upToIdx = (() => {
	const flag = process.argv.indexOf('--up-to');
	if (flag === -1) return ALL_MIGRATIONS.length - 1; // no limit — process all
	const tag = process.argv[flag + 1];
	if (!tag) {
		console.error('--up-to requires a migration tag, e.g. --up-to 0007_tan_mongu');
		process.exit(1);
	}
	const found = ALL_MIGRATIONS.findIndex((m) => m.tag === tag);
	if (found === -1) {
		console.error(`Unknown migration tag: "${tag}"`);
		console.error('Known tags:\n' + ALL_MIGRATIONS.map((m) => `  ${m.tag}`).join('\n'));
		process.exit(1);
	}
	return found;
})();

const MIGRATIONS_TO_TRACK = ALL_MIGRATIONS.slice(0, upToIdx + 1);

if (upToIdx < ALL_MIGRATIONS.length - 1) {
	const skipped = ALL_MIGRATIONS.length - MIGRATIONS_TO_TRACK.length;
	console.log(
		`Tracking up to: ${MIGRATIONS_TO_TRACK[upToIdx].tag} (skipping ${skipped} later migration(s) — drizzle-kit will apply those)\n`
	);
}

async function main() {
	const sql = postgres(DATABASE_URL!, { max: 1 });

	try {
		// Ensure schema and table exist (drizzle-kit creates these; they should already exist)
		if (!dryRun) {
			await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
			await sql`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `;
		}

		// Check what's already tracked
		const existing = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
		const existingHashes = new Set(existing.map((r: { hash: string }) => r.hash));
		console.log(
			`Already tracked: ${existingHashes.size} / ${MIGRATIONS_TO_TRACK.length} migrations (in scope)`
		);

		const missing: Array<(typeof ALL_MIGRATIONS)[number] & { hash: string }> = [];
		for (const m of MIGRATIONS_TO_TRACK) {
			const sqlContent = readFileSync(`drizzle/${m.tag}.sql`).toString();
			const hash = createHash('sha256').update(sqlContent).digest('hex');
			if (!existingHashes.has(hash)) {
				console.log(`  - MISSING  ${m.tag}`);
				missing.push({ ...m, hash });
			} else {
				console.log(`  ✓ tracked  ${m.tag}`);
			}
		}

		if (missing.length === 0) {
			console.log('\nAll migrations already tracked. Nothing to do.');
			return;
		}

		console.log(`\n${missing.length} migration(s) need to be tracked.`);

		if (dryRun) {
			console.log('\nDry run complete — re-run without --dry-run to apply.');
			return;
		}

		for (const m of missing) {
			await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${m.hash}, ${m.when})
      `;
			console.log(`  + inserted ${m.tag}`);
		}

		console.log(`\nDone. Inserted ${missing.length} missing migration records.`);
		console.log('Now run: bun run db:migrate');
	} finally {
		await sql.end();
	}
}

main();
