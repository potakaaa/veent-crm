-- Recurring-organizer "has future events" flag (GitHub #94).
-- The other onboarding/fee columns emitted by drizzle-kit against the stale
-- upstream snapshot are already present on the database (applied via db:push
-- with PRs #100/#126) and were trimmed here; the 0015 meta snapshot still
-- captures the full current schema so future db:generate stays consistent.
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "has_future_events" boolean DEFAULT false NOT NULL;
