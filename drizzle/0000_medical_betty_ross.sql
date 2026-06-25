CREATE TYPE "public"."crm_activity_channel" AS ENUM('fb_dm', 'fb_comment', 'ig_dm', 'email', 'call', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."crm_activity_outcome" AS ENUM('sent', 'replied', 'no_response', 'rejected', 'other');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_category" AS ENUM('Sports', 'Workshop', 'Church', 'Theater', 'Bar/DJ', 'Conference', 'Music Fest', 'Fan Fair', 'School', 'Concert', 'Live Band', 'Expo', 'Screening', 'Camp', 'Competition', 'Convention', 'Film', 'Modelling', 'Resort', 'Other');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_platform" AS ENUM('Facebook', 'Instagram', 'Twitter/X', 'TikTok', 'Other');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_source" AS ENUM('sheet_import', 'manual', 'scraper', 'other');--> statement-breakpoint
CREATE TYPE "public"."crm_lead_stage" AS ENUM('new', 'contacted', 'replied', 'in_discussion', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."crm_lost_reason" AS ENUM('no_response', 'rejected', 'not_a_fit');--> statement-breakpoint
CREATE TYPE "public"."crm_user_role" AS ENUM('rep', 'manager');--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"rep_id" uuid,
	"channel" "crm_activity_channel" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "crm_activity_outcome",
	"follow_up_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_lead_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "crm_lead_category" DEFAULT 'Other' NOT NULL,
	"location" text,
	"platform" "crm_lead_platform",
	"social_facebook" text,
	"social_instagram" text,
	"social_tiktok" text,
	"social_twitter" text,
	"page_url" text,
	"normalized_handle" text,
	"contact_email" text,
	"event_name" text,
	"event_date" date,
	"event_date_raw" text,
	"event_link" text,
	"stage" "crm_lead_stage" DEFAULT 'new' NOT NULL,
	"lost_reason" "crm_lost_reason",
	"owner_id" uuid,
	"source" "crm_lead_source" DEFAULT 'manual' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"won_org_name" text,
	"deal_value_cents" integer,
	"currency" text DEFAULT 'PHP',
	"signed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" "crm_user_role" DEFAULT 'rep' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"auth_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_rep_id_crm_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_history" ADD CONSTRAINT "crm_lead_history_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_history" ADD CONSTRAINT "crm_lead_history_actor_user_id_crm_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_owner_id_crm_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activities_lead_idx" ON "crm_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_activities_dedupe_uq" ON "crm_activities" USING btree ("lead_id","rep_id","occurred_at","channel");--> statement-breakpoint
CREATE INDEX "crm_activities_follow_up_idx" ON "crm_activities" USING btree ("follow_up_at") WHERE "crm_activities"."follow_up_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "crm_lead_history_lead_idx" ON "crm_lead_history" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "crm_leads_normalized_handle_idx" ON "crm_leads" USING btree ("normalized_handle");--> statement-breakpoint
CREATE INDEX "crm_leads_stage_idx" ON "crm_leads" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_leads_owner_idx" ON "crm_leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "crm_leads_last_activity_idx" ON "crm_leads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_users_email_uq" ON "crm_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_users_auth_subject_uq" ON "crm_users" USING btree ("auth_subject");