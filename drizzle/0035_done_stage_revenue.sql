-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md,
-- and a second collision at meta/0026<->0030 missing 0027-0029 snapshot files, documented in
-- process/features/pipeline/backlog/drizzle-snapshot-chain-collision-0026-0030_NOTE_09-07-26.md).
-- GitHub #273 — add 'done' pipeline stage (after 'live') + revenue_cents column for post-event revenue tagging.

ALTER TYPE "public"."crm_lead_stage" ADD VALUE 'done' AFTER 'live';
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "revenue_cents" integer;
