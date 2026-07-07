-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- CAT-1 (GitHub #248) — retire the leadCategory enum. IRREVERSIBLE (DROP COLUMN + DROP TYPE).
-- Order matters: convert the templates column off the enum BEFORE dropping the type, else DROP TYPE fails.

-- 1. Convert crm_message_templates.category from the enum to plain text (preserves all string values).
ALTER TABLE "crm_message_templates" ALTER COLUMN "category" TYPE text USING "category"::text;
--> statement-breakpoint
-- 2. Drop the legacy enum column from crm_leads (categories now live in crm_lead_categories).
ALTER TABLE "crm_leads" DROP COLUMN IF EXISTS "category";
--> statement-breakpoint
-- 3. Drop the now-unreferenced enum type.
DROP TYPE IF EXISTS "crm_lead_category" CASCADE;
