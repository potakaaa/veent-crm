ALTER TYPE "public"."crm_activity_channel" ADD VALUE 'scraped_event';--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "event_name" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "event_date" date;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "event_url" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "event_category" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "event_source" text;