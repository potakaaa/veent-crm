-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- GitHub #275 — persistent manager-editable per-user color. Additive nullable column, no backfill.

ALTER TABLE "crm_users" ADD COLUMN "color" text;
