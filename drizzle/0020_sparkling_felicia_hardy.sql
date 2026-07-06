CREATE TABLE "crm_organizers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_handle" text,
	"social_facebook" text,
	"social_instagram" text,
	"website" text,
	"email" text,
	"phone" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "organizer_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organizer_id_crm_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."crm_organizers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_leads_organizer_idx" ON "crm_leads" USING btree ("organizer_id");