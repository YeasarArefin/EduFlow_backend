CREATE TYPE "public"."student_gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_code" varchar(30) NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"phone" varchar(30),
	"guardian_name" varchar(150),
	"guardian_phone" varchar(30),
	"address" text,
	"gender" "student_gender",
	"admission_date" date,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "students_workspace_code_idx" ON "students" USING btree ("workspace_id","student_code");--> statement-breakpoint
CREATE INDEX "students_workspace_status_idx" ON "students" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "students_workspace_name_idx" ON "students" USING btree ("workspace_id","full_name");--> statement-breakpoint
CREATE INDEX "students_workspace_phone_idx" ON "students" USING btree ("workspace_id","phone");--> statement-breakpoint
CREATE INDEX "students_workspace_guardian_phone_idx" ON "students" USING btree ("workspace_id","guardian_phone");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE students TO eduflow_app;
--> statement-breakpoint
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY students_workspace_isolation ON students
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
