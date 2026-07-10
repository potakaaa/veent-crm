-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- CAT-1 (GitHub #248) — backfill crm_lead_categories from the legacy crm_leads.category enum column.
-- Note: crm_leads.category is still the enum column at this point (dropped in 0028). Cast to text for the JOIN.

INSERT INTO "crm_lead_categories" ("id", "lead_id", "category_id", "created_at")
SELECT gen_random_uuid(), l."id", c."id", NOW()
FROM "crm_leads" l
JOIN "crm_categories" c ON LOWER(c."name") = LOWER(l."category"::text)
WHERE l."category" IS NOT NULL AND l."deleted_at" IS NULL
ON CONFLICT ("lead_id", "category_id") DO NOTHING;
