CREATE TABLE "batch_subjects" (
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "class_level_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_subjects_batch_subject_idx" ON "batch_subjects" USING btree ("batch_id","subject_id");--> statement-breakpoint
CREATE INDEX "batch_subjects_workspace_idx" ON "batch_subjects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "batch_subjects_subject_idx" ON "batch_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "batches_class_level_idx" ON "batches" USING btree ("class_level_id");--> statement-breakpoint
CREATE INDEX "batches_medium_idx" ON "batches" USING btree ("medium_id");--> statement-breakpoint
CREATE INDEX "batches_academic_group_idx" ON "batches" USING btree ("academic_group_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_monthly_fee_minor_nonnegative_chk" CHECK ("batches"."monthly_fee_minor" >= 0);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE batch_subjects TO eduflow_app;
--> statement-breakpoint
ALTER TABLE batch_subjects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY batch_subjects_workspace_isolation ON batch_subjects
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
