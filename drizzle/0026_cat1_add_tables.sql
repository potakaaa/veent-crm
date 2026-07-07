-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)
-- CAT-1 (GitHub #248) — create crm_categories + crm_lead_categories, seed 20 legacy enum values.

CREATE TABLE IF NOT EXISTS "crm_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_categories" ADD CONSTRAINT "crm_categories_created_by_crm_users_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "crm_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_categories_name_lower_idx" ON "crm_categories" (LOWER("name"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_categories_deleted_at_idx" ON "crm_categories" ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_lead_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_lead_categories" ADD CONSTRAINT "crm_lead_categories_lead_id_crm_leads_id_fk"
		FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_lead_categories" ADD CONSTRAINT "crm_lead_categories_category_id_crm_categories_id_fk"
		FOREIGN KEY ("category_id") REFERENCES "crm_categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_categories_pair_idx" ON "crm_lead_categories" ("lead_id","category_id");
--> statement-breakpoint
INSERT INTO "crm_categories" ("id", "name") VALUES
	(gen_random_uuid(), 'Sports'),
	(gen_random_uuid(), 'Workshop'),
	(gen_random_uuid(), 'Church'),
	(gen_random_uuid(), 'Theater'),
	(gen_random_uuid(), 'Bar/DJ'),
	(gen_random_uuid(), 'Conference'),
	(gen_random_uuid(), 'Music Fest'),
	(gen_random_uuid(), 'Fan Fair'),
	(gen_random_uuid(), 'School'),
	(gen_random_uuid(), 'Concert'),
	(gen_random_uuid(), 'Live Band'),
	(gen_random_uuid(), 'Expo'),
	(gen_random_uuid(), 'Screening'),
	(gen_random_uuid(), 'Camp'),
	(gen_random_uuid(), 'Competition'),
	(gen_random_uuid(), 'Convention'),
	(gen_random_uuid(), 'Film'),
	(gen_random_uuid(), 'Modelling'),
	(gen_random_uuid(), 'Resort'),
	(gen_random_uuid(), 'Other')
ON CONFLICT DO NOTHING;
