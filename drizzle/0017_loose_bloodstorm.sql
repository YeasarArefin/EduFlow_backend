CREATE TABLE "batch_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_teachers" ADD CONSTRAINT "batch_teachers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_teachers" ADD CONSTRAINT "batch_teachers_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_teachers" ADD CONSTRAINT "batch_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_teachers_batch_teacher_idx" ON "batch_teachers" USING btree ("batch_id","teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_teachers_one_primary_idx" ON "batch_teachers" USING btree ("batch_id") WHERE "batch_teachers"."is_primary";--> statement-breakpoint
CREATE INDEX "batch_teachers_workspace_batch_idx" ON "batch_teachers" USING btree ("workspace_id","batch_id");--> statement-breakpoint
CREATE INDEX "batch_teachers_teacher_idx" ON "batch_teachers" USING btree ("teacher_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE batch_teachers TO eduflow_app;
--> statement-breakpoint
ALTER TABLE batch_teachers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY batch_teachers_workspace_isolation ON batch_teachers
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
