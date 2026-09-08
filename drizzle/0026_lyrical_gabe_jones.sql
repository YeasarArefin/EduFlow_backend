CREATE TABLE "workspace_role_permission_overrides" (
  "workspace_id" uuid NOT NULL,
  "role_code" smallint NOT NULL,
  "permission_code" integer NOT NULL,
  "allowed" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_role_permission_overrides_workspace_id_role_code_permission_code_pk" PRIMARY KEY("workspace_id", "role_code", "permission_code")
);
--> statement-breakpoint
ALTER TABLE "workspace_role_permission_overrides" ADD CONSTRAINT "workspace_role_permission_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_role_permission_overrides" ADD CONSTRAINT "workspace_role_permission_overrides_role_code_workspace_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."workspace_roles"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_role_permission_overrides" ADD CONSTRAINT "workspace_role_permission_overrides_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_role_permission_overrides_permission_idx" ON "workspace_role_permission_overrides" USING btree ("permission_code");
--> statement-breakpoint
ALTER TABLE "workspace_role_permission_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_role_permission_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_role_permission_overrides_workspace_isolation" ON "workspace_role_permission_overrides" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_role_permission_overrides"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_role_permission_overrides"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workspace_role_permission_overrides" TO eduflow_app;
