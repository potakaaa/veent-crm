CREATE TABLE "crm_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lead_id" uuid,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_notifications_user_idx" ON "crm_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_notifications_user_unread_idx" ON "crm_notifications" USING btree ("user_id","read_at");