CREATE TYPE "public"."teacher_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"teacher_code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"phone" varchar(30),
	"email" varchar(255),
	"subject_specialty" varchar(150),
	"default_salary_minor" bigint DEFAULT 0 NOT NULL,
	"status" "teacher_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teachers_workspace_code_idx" ON "teachers" USING btree ("workspace_id","teacher_code");--> statement-breakpoint
CREATE INDEX "teachers_workspace_status_idx" ON "teachers" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "teachers_workspace_name_idx" ON "teachers" USING btree ("workspace_id","name");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE teachers TO eduflow_app;
--> statement-breakpoint
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY teachers_workspace_isolation ON teachers USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
