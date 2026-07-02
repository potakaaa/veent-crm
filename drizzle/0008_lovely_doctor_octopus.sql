ALTER TABLE "crm_leads" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "scraper_org_id" integer;--> statement-breakpoint
CREATE INDEX "crm_leads_country_idx" ON "crm_leads" USING btree ("country");