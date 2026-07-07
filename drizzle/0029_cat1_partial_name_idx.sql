-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- CAT-1 (GitHub #248) — make the category name uniqueness index partial (active rows only).
-- Previously: global UNIQUE on LOWER(name) — soft-deleted categories blocked reuse of their names.
-- After: partial UNIQUE on LOWER(name) WHERE deleted_at IS NULL — deleted names are reusable.

DROP INDEX IF EXISTS "crm_categories_name_lower_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "crm_categories_name_lower_idx" ON "crm_categories" (LOWER("name")) WHERE "deleted_at" IS NULL;
