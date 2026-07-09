-- HAND-WRITTEN: NCAL-3 — add 3 nullable text UID columns for Nextcloud calendar sync.
-- db:generate is blocked by snapshot-chain collision (see backlog/drizzle-migration-journal-drift_02-07-26.md).
-- All three columns are nullable (no NOT NULL constraint, no DEFAULT), matching schema.ts declarations.

ALTER TABLE "crm_meetings" ADD COLUMN "nextcloud_uid" text;
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "nextcloud_go_live_uid" text;
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "nextcloud_event_uid" text;
