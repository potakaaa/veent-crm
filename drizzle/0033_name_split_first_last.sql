-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- GitHub #277 — split crm_users.name into first_name (NOT NULL, backfilled verbatim) + last_name (nullable).
-- Ordering is load-bearing: add first_name -> backfill -> set-not-null -> add last_name -> drop name.

ALTER TABLE "crm_users" ADD COLUMN "first_name" text;
--> statement-breakpoint
UPDATE "crm_users" SET "first_name" = "name";
--> statement-breakpoint
ALTER TABLE "crm_users" ALTER COLUMN "first_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "crm_users" ADD COLUMN "last_name" text;
--> statement-breakpoint
ALTER TABLE "crm_users" DROP COLUMN "name";
