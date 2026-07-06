CREATE INDEX "crm_notes_lead_idx" ON "crm_notes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "crm_notes_organizer_idx" ON "crm_notes" USING btree ("organizer_id");