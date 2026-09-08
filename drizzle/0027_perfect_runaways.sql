CREATE TABLE "workspace_custom_role_permissions" (
	"workspace_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_code" integer NOT NULL,
	"allowed" boolean NOT NULL,
	CONSTRAINT "workspace_custom_role_permissions_workspace_id_role_id_permission_code_pk" PRIMARY KEY("workspace_id","role_id","permission_code")
);
--> statement-breakpoint
CREATE TABLE "workspace_custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_custom_role_permissions" ADD CONSTRAINT "workspace_custom_role_permissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_custom_role_permissions" ADD CONSTRAINT "workspace_custom_role_permissions_role_id_workspace_custom_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."workspace_custom_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_custom_role_permissions" ADD CONSTRAINT "workspace_custom_role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_custom_roles" ADD CONSTRAINT "workspace_custom_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_custom_role_permissions_role_idx" ON "workspace_custom_role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_custom_roles_workspace_name_idx" ON "workspace_custom_roles" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "workspace_custom_roles_workspace_idx" ON "workspace_custom_roles" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "workspace_custom_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_custom_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_custom_roles_workspace_isolation" ON "workspace_custom_roles" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "workspace_custom_role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_custom_role_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_custom_role_permissions_workspace_isolation" ON "workspace_custom_role_permissions" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workspace_custom_roles", "workspace_custom_role_permissions" TO eduflow_app;
