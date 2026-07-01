CREATE TABLE "crm_meeting_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"organizer_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"meeting_url" text,
	"notes" text,
	"outcome" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_meeting_attendees" ADD CONSTRAINT "crm_meeting_attendees_meeting_id_crm_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."crm_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meeting_attendees" ADD CONSTRAINT "crm_meeting_attendees_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meetings" ADD CONSTRAINT "crm_meetings_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meetings" ADD CONSTRAINT "crm_meetings_organizer_id_crm_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_meeting_attendees_meeting_user_uq" ON "crm_meeting_attendees" USING btree ("meeting_id","user_id");--> statement-breakpoint
CREATE INDEX "crm_meetings_lead_idx" ON "crm_meetings" USING btree ("lead_id");