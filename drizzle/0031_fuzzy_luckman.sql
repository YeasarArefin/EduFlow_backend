CREATE TYPE "public"."notice_audience" AS ENUM('batch', 'all_students', 'all_teachers', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."notice_recipient_kind" AS ENUM('student', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."notice_recipient_status" AS ENUM('queued', 'processing', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "notice_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"notice_id" uuid NOT NULL,
	"recipient_kind" "notice_recipient_kind" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_email" varchar(255),
	"status" "notice_recipient_status" DEFAULT 'queued' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audience" "notice_audience" NOT NULL,
	"batch_id" uuid,
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notice_recipients_notice_kind_recipient_idx" ON "notice_recipients" USING btree ("notice_id","recipient_kind","recipient_id");--> statement-breakpoint
CREATE INDEX "notice_recipients_workspace_notice_status_idx" ON "notice_recipients" USING btree ("workspace_id","notice_id","status");--> statement-breakpoint
CREATE INDEX "notice_recipients_notice_status_idx" ON "notice_recipients" USING btree ("notice_id","status");--> statement-breakpoint
CREATE INDEX "notices_workspace_created_idx" ON "notices" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notices_workspace_isolation" ON "notices" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
ALTER TABLE "notice_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notice_recipients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notice_recipients_workspace_isolation" ON "notice_recipients" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notices", "notice_recipients" TO eduflow_app;
