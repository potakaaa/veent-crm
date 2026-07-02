CREATE TYPE "public"."crm_lead_visibility" AS ENUM('only_me', 'everyone', 'selected');--> statement-breakpoint
CREATE TABLE "crm_lead_visibility_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "visibility" "crm_lead_visibility" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_lead_visibility_grants" ADD CONSTRAINT "crm_lead_visibility_grants_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_visibility_grants" ADD CONSTRAINT "crm_lead_visibility_grants_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_visibility_grants_lead_user_uq" ON "crm_lead_visibility_grants" USING btree ("lead_id","user_id");