-- HAND-WRITTEN: NAV-2 — add current_platform and competitor_notes to crm_leads.
-- Both columns are nullable text (no NOT NULL constraint), matching schema.ts declarations.

ALTER TABLE "crm_leads" ADD COLUMN "current_platform" text;
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "competitor_notes" text;
