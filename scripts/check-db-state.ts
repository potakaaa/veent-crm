/**
 * Diagnose which migrations are actually applied to the target DB.
 * Usage: bun run scripts/check-db-state.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const url = DATABASE_URL.replace(/[&?]channel_binding=[^&]*/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const tbls = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('crm_organizers','crm_notes','crm_categories','crm_lead_categories','crm_notifications')
  ORDER BY table_name
`;
console.log(
	'tables present:',
	tbls.map((r: { table_name: string }) => r.table_name)
);

const leads = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_leads'
  AND column_name IN ('category','nextcloud_go_live_uid','nextcloud_event_uid','current_platform','revenue_cents')
  ORDER BY column_name
`;
console.log(
	'crm_leads cols:',
	leads.map((r: { column_name: string }) => r.column_name)
);

const meetings = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_meetings'
  AND column_name IN ('venue','nextcloud_uid')
  ORDER BY column_name
`;
console.log(
	'crm_meetings cols:',
	meetings.map((r: { column_name: string }) => r.column_name)
);

const users = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_users'
  AND column_name IN ('name','first_name','last_name','color')
  ORDER BY column_name
`;
console.log(
	'crm_users cols:',
	users.map((r: { column_name: string }) => r.column_name)
);

const stage = await sql`
  SELECT enumlabel FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'crm_lead_stage'
  ORDER BY e.enumsortorder
`;
console.log(
	'crm_lead_stage values:',
	stage.map((r: { enumlabel: string }) => r.enumlabel)
);

await sql.end();
