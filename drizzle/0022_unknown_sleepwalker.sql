CREATE TABLE "crm_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"author_id" uuid NOT NULL,
	"lead_id" uuid,
	"organizer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_notes_target_ck" CHECK (("lead_id" IS NOT NULL) <> ("organizer_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_author_id_crm_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_organizer_id_crm_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."crm_organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO crm_notes (content, author_id, lead_id, created_at, updated_at)
SELECT l.notes,
       (SELECT id FROM crm_users ORDER BY created_at ASC LIMIT 1),
       l.id,
       now(), now()
FROM crm_leads l
WHERE l.notes IS NOT NULL
  AND l.notes <> ''
  AND EXISTS (SELECT 1 FROM crm_users);