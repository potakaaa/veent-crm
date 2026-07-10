/**
 * One-shot patch for production DBs bootstrapped via db:push BEFORE migration 0025
 * was generated. Migration 0025 adds lead_organizer_id to crm_meetings, but if the
 * DB was set up earlier the column is absent even though 0025 is stamped as applied.
 *
 * Safe to run multiple times — checks before altering.
 * Usage: bun run scripts/patch-missing-0025.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const url = DATABASE_URL.replace(/[&?]channel_binding=[^&]*/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const rows = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'crm_meetings'
    AND column_name  = 'lead_organizer_id'
`;

if (rows.length > 0) {
	console.log('✓ lead_organizer_id already exists — nothing to do');
	await sql.end();
	process.exit(0);
}

console.log('lead_organizer_id missing — applying migration 0025 DDL...');

await sql`ALTER TABLE "crm_meetings" ADD COLUMN "lead_organizer_id" uuid`;
await sql`
  ALTER TABLE "crm_meetings"
  ADD CONSTRAINT "crm_meetings_lead_organizer_id_crm_organizers_id_fk"
  FOREIGN KEY ("lead_organizer_id")
  REFERENCES "public"."crm_organizers"("id")
  ON DELETE set null ON UPDATE no action
`;

console.log('✓ column and FK added successfully');
await sql.end();
