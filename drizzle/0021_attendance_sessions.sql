CREATE TYPE "public"."attendance_session_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE UNIQUE INDEX "batches_id_workspace_idx" ON "batches" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "session_date" date NOT NULL,
  "status" "attendance_session_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "attendance_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_batch_date_idx" ON "attendance_sessions" USING btree ("batch_id","session_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_id_workspace_idx" ON "attendance_sessions" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_workspace_date_idx" ON "attendance_sessions" USING btree ("workspace_id","session_date");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_batch_workspace_fk" FOREIGN KEY ("batch_id","workspace_id") REFERENCES "public"."batches"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "attendance_session_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "status" "attendance_status" DEFAULT 'absent' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_workspace_fk" FOREIGN KEY ("attendance_session_id","workspace_id") REFERENCES "public"."attendance_sessions"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_workspace_fk" FOREIGN KEY ("student_id","workspace_id") REFERENCES "public"."students"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student_idx" ON "attendance_records" USING btree ("attendance_session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_workspace_session_idx" ON "attendance_records" USING btree ("workspace_id","attendance_session_id");--> statement-breakpoint
CREATE INDEX "attendance_records_student_workspace_idx" ON "attendance_records" USING btree ("student_id","workspace_id");--> statement-breakpoint
CREATE POLICY "attendance_sessions_workspace_isolation" ON "attendance_sessions" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("attendance_sessions"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("attendance_sessions"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "attendance_records_workspace_isolation" ON "attendance_records" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("attendance_records"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("attendance_records"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
ALTER TABLE "attendance_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "attendance_sessions", "attendance_records" TO eduflow_app;

-- Rollback is manual: attendance history is operationally significant. Retain
-- exported sessions and records before dropping these tables, policies, enums,
-- indexes, and the supporting batches(id, workspace_id) index.
