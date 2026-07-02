ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "fee_structure" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "transaction_fee_pct" double precision DEFAULT 7;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "convenience_fee_pesos" double precision DEFAULT 20;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "service_fee_pct" double precision DEFAULT 3;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "service_fee_per_ticket_pesos" double precision DEFAULT 20;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "bank_charges_absorbed" boolean;
