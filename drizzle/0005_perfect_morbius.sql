CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bkash', 'nagad', 'rocket', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_request_purpose" AS ENUM('subscription', 'sms_credit');--> statement-breakpoint
CREATE TYPE "public"."payment_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"purpose" "payment_request_purpose" DEFAULT 'subscription' NOT NULL,
	"plan_id" uuid,
	"amount_minor" bigint NOT NULL,
	"payment_method" "payment_method" DEFAULT 'bkash' NOT NULL,
	"sender_bkash_number" varchar(30) NOT NULL,
	"transaction_id" varchar(100) NOT NULL,
	"status" "payment_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_subscription_plan_chk" CHECK ("payment_requests"."purpose" <> 'subscription' or "payment_requests"."plan_id" is not null),
	CONSTRAINT "payment_requests_amount_minor_nonnegative_chk" CHECK ("payment_requests"."amount_minor" >= 0),
	CONSTRAINT "payment_requests_reviewed_at_status_chk" CHECK ("payment_requests"."status" = 'pending' or "payment_requests"."reviewed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_requests_workspace_status_idx" ON "payment_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "payment_requests_status_created_idx" ON "payment_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_requests_plan_idx" ON "payment_requests" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_transaction_id_idx" ON "payment_requests" USING btree ("transaction_id");