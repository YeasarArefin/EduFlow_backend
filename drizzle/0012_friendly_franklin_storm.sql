CREATE TYPE "public"."batch_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'inactive', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "student_tag_assignments" (
	"student_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mediums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"enrolled_at" date,
	"ended_at" date,
	"fee_start_month" date,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"class_level_id" uuid,
	"medium_id" uuid,
	"academic_group_id" uuid,
	"monthly_fee_minor" bigint DEFAULT 0 NOT NULL,
	"status" "batch_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"max_capacity" integer,
	"room" varchar(100),
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "institution" varchar(200);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "class_level_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "medium_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "academic_group_id" uuid;--> statement-breakpoint
ALTER TABLE "student_tag_assignments" ADD CONSTRAINT "student_tag_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tag_assignments" ADD CONSTRAINT "student_tag_assignments_tag_id_student_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."student_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediums" ADD CONSTRAINT "mediums_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tags" ADD CONSTRAINT "student_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_class_level_id_class_levels_id_fk" FOREIGN KEY ("class_level_id") REFERENCES "public"."class_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_medium_id_mediums_id_fk" FOREIGN KEY ("medium_id") REFERENCES "public"."mediums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_academic_group_id_academic_groups_id_fk" FOREIGN KEY ("academic_group_id") REFERENCES "public"."academic_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_tag_assignments_student_tag_idx" ON "student_tag_assignments" USING btree ("student_id","tag_id");--> statement-breakpoint
CREATE INDEX "student_tag_assignments_tag_idx" ON "student_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_groups_workspace_name_idx" ON "academic_groups" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "class_levels_workspace_name_idx" ON "class_levels" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "mediums_workspace_name_idx" ON "mediums" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_tags_workspace_name_idx" ON "student_tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "batch_enrollments_workspace_student_idx" ON "batch_enrollments" USING btree ("workspace_id","student_id");--> statement-breakpoint
CREATE INDEX "batch_enrollments_workspace_batch_idx" ON "batch_enrollments" USING btree ("workspace_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_workspace_name_idx" ON "batches" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "batches_workspace_status_idx" ON "batches" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_level_id_class_levels_id_fk" FOREIGN KEY ("class_level_id") REFERENCES "public"."class_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_medium_id_mediums_id_fk" FOREIGN KEY ("medium_id") REFERENCES "public"."mediums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_academic_group_id_academic_groups_id_fk" FOREIGN KEY ("academic_group_id") REFERENCES "public"."academic_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "students_class_level_idx" ON "students" USING btree ("class_level_id");--> statement-breakpoint
CREATE INDEX "students_medium_idx" ON "students" USING btree ("medium_id");--> statement-breakpoint
CREATE INDEX "students_academic_group_idx" ON "students" USING btree ("academic_group_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE class_levels, mediums, academic_groups, student_tags, student_tag_assignments, batches, batch_enrollments TO eduflow_app;
--> statement-breakpoint
ALTER TABLE class_levels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mediums ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE academic_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_tags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE batch_enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY class_levels_workspace_isolation ON class_levels USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY mediums_workspace_isolation ON mediums USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY academic_groups_workspace_isolation ON academic_groups USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY student_tags_workspace_isolation ON student_tags USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY batches_workspace_isolation ON batches USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY batch_enrollments_workspace_isolation ON batch_enrollments USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
