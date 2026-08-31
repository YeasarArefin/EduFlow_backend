CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'pending', 'active', 'renewal_due', 'expired', 'cancelled', 'suspended');--> statement-breakpoint
CREATE TABLE "features" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_id" uuid NOT NULL,
	"feature_key" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"limit_value" bigint,
	CONSTRAINT "plan_features_plan_id_feature_key_pk" PRIMARY KEY("plan_id","feature_key"),
	CONSTRAINT "plan_features_limit_nonnegative_chk" CHECK ("plan_features"."limit_value" is null or "plan_features"."limit_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"duration_days" integer NOT NULL,
	"trial_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug"),
	CONSTRAINT "plans_price_minor_nonnegative_chk" CHECK ("plans"."price_minor" >= 0),
	CONSTRAINT "plans_duration_days_nonnegative_chk" CHECK ("plans"."duration_days" >= 0),
	CONSTRAINT "plans_trial_days_nonnegative_chk" CHECK ("plans"."trial_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"renewal_due_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feature_key" varchar(100) NOT NULL,
	"enabled_override" boolean,
	"limit_override" bigint,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_entitlement_overrides_limit_nonnegative_chk" CHECK ("workspace_entitlement_overrides"."limit_override" is null or "workspace_entitlement_overrides"."limit_override" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_key_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "public"."features"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_entitlement_overrides" ADD CONSTRAINT "workspace_entitlement_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_entitlement_overrides" ADD CONSTRAINT "workspace_entitlement_overrides_feature_key_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "public"."features"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_features_feature_idx" ON "plan_features" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "plans_active_idx" ON "plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_status_idx" ON "subscriptions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_current_per_workspace_idx" ON "subscriptions" USING btree ("workspace_id") WHERE "subscriptions"."status" in ('trial', 'pending', 'active', 'renewal_due');--> statement-breakpoint
CREATE INDEX "subscriptions_expires_idx" ON "subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_renewal_due_idx" ON "subscriptions" USING btree ("renewal_due_at");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_entitlement_overrides_workspace_feature_idx" ON "workspace_entitlement_overrides" USING btree ("workspace_id","feature_key");--> statement-breakpoint
CREATE INDEX "workspace_entitlement_overrides_expires_idx" ON "workspace_entitlement_overrides" USING btree ("expires_at");