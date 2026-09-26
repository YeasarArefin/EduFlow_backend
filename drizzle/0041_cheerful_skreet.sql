CREATE TYPE "public"."sms_message_status" AS ENUM('queued', 'processing', 'completed', 'partially_delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sms_recipient_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" varchar(50) NOT NULL,
	"body" text NOT NULL,
	"status" "sms_message_status" DEFAULT 'queued' NOT NULL,
	"recipient_count" integer NOT NULL,
	"credits_required" bigint NOT NULL,
	"credits_reserved" bigint NOT NULL,
	"credits_used" bigint DEFAULT 0 NOT NULL,
	"credits_refunded" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"student_id" uuid,
	"recipient_type" varchar(20) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"segments" integer NOT NULL,
	"credits" bigint NOT NULL,
	"status" "sms_recipient_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"provider_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_message_id_sms_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_messages_workspace_status_idx" ON "sms_messages" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "sms_recipients_message_status_idx" ON "sms_recipients" USING btree ("message_id","status");--> statement-breakpoint
CREATE INDEX "sms_recipients_workspace_status_idx" ON "sms_recipients" USING btree ("workspace_id","status");