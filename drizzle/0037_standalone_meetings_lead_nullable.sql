-- HAND-WRITTEN: standalone meetings — make crm_meetings.lead_id nullable so a meeting can exist without a linked lead.
-- db:generate is blocked by a pre-existing snapshot-chain collision (crm_users name → first_name phantom rename;
-- see backlog/drizzle-migration-journal-drift_02-07-26.md). Same reason 0036 was hand-written.
-- Additive/backwards-compatible: strictly widening (DROP NOT NULL). No data rewrite, no backfill; every existing row keeps its value.

ALTER TABLE "crm_meetings" ALTER COLUMN "lead_id" DROP NOT NULL;
