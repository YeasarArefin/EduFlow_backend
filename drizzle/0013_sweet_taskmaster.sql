CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_workspace_name_idx" ON "subjects" USING btree ("workspace_id","name");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE subjects TO eduflow_app;
--> statement-breakpoint
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY subjects_workspace_isolation ON subjects USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
