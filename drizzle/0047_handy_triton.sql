CREATE TYPE "public"."notification_delivery_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_id" text NOT NULL,
	"channel" varchar(10) NOT NULL,
	"recipient" text,
	"status" "notification_delivery_status" NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_event_channel_recipient_idx" ON "notification_deliveries" USING btree ("workspace_id","event_type","event_id","channel","recipient");--> statement-breakpoint
CREATE INDEX "notification_deliveries_workspace_event_idx" ON "notification_deliveries" USING btree ("workspace_id","event_type","event_id");