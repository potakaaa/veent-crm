ALTER TABLE "crm_leads" ADD COLUMN "source_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_leads_source_ref_uq" ON "crm_leads" USING btree ("source_ref") WHERE source_ref IS NOT NULL;