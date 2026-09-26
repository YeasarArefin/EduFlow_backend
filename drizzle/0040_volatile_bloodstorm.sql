CREATE TYPE "public"."sms_recharge_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "sms_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"credits" bigint NOT NULL,
	"price_minor" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_packages_values_chk" CHECK ("sms_packages"."credits" > 0 and "sms_packages"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sms_recharge_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"credits" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"payment_method" varchar(20) DEFAULT 'bkash' NOT NULL,
	"transaction_id" varchar(100) NOT NULL,
	"status" "sms_recharge_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_recharge_requests_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "sms_recharge_requests_values_chk" CHECK ("sms_recharge_requests"."credits" > 0 and "sms_recharge_requests"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sms_recharge_requests" ADD CONSTRAINT "sms_recharge_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_recharge_requests" ADD CONSTRAINT "sms_recharge_requests_package_id_sms_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."sms_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_packages_active_idx" ON "sms_packages" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sms_recharge_requests_workspace_created_idx" ON "sms_recharge_requests" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_recharge_requests_status_created_idx" ON "sms_recharge_requests" USING btree ("status","created_at");