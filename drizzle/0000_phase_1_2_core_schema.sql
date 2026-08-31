CREATE TYPE "public"."member_status" AS ENUM('invited', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('pending', 'active', 'locked', 'suspended', 'scheduled_deletion', 'deleted');--> statement-breakpoint
CREATE TABLE "platform_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"singleton_key" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_owners_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "platform_owners_singleton_chk" CHECK ("platform_owners"."singleton_key" = 1)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" integer PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(100),
	"module" varchar(50),
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_code" smallint NOT NULL,
	"permission_code" integer NOT NULL,
	CONSTRAINT "role_permissions_role_code_permission_code_pk" PRIMARY KEY("role_code","permission_code")
);
--> statement-breakpoint
CREATE TABLE "workspace_roles" (
	"code" smallint PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "member_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"permission_code" integer NOT NULL,
	"allowed" boolean NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role_code" smallint NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"invited_by" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"default_fee_due_day" smallint,
	"grace_period_days" smallint DEFAULT 0 NOT NULL,
	"receipt_prefix" varchar(20),
	"default_language" varchar(10) DEFAULT 'bn' NOT NULL,
	"absence_email_enabled" boolean DEFAULT true NOT NULL,
	"absence_email_recipient" varchar(20) DEFAULT 'guardian' NOT NULL,
	"sms_default_sender_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_settings_default_language_chk" CHECK ("workspace_settings"."default_language" in ('bn', 'en'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150),
	"slug" varchar(100),
	"status" "workspace_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text,
	"logo_path" text,
	"phone" varchar(30),
	"email" varchar(255),
	"address" text,
	"activated_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"scheduled_delete_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_code_workspace_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."workspace_roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permission_overrides" ADD CONSTRAINT "member_permission_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permission_overrides" ADD CONSTRAINT "member_permission_overrides_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permission_overrides" ADD CONSTRAINT "member_permission_overrides_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_code_workspace_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."workspace_roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_owners_singleton_idx" ON "platform_owners" USING btree ("singleton_key");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_code");--> statement-breakpoint
CREATE UNIQUE INDEX "member_permission_overrides_member_permission_idx" ON "member_permission_overrides" USING btree ("member_id","permission_code");--> statement-breakpoint
CREATE INDEX "member_permission_overrides_workspace_idx" ON "member_permission_overrides" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "member_permission_overrides_permission_idx" ON "member_permission_overrides" USING btree ("permission_code");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_role_idx" ON "workspace_members" USING btree ("workspace_id","role_code");--> statement-breakpoint
CREATE INDEX "workspaces_status_idx" ON "workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspaces_scheduled_delete_idx" ON "workspaces" USING btree ("scheduled_delete_at");