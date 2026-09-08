CREATE TYPE "public"."student_payment_method" AS ENUM('cash', 'bkash', 'nagad', 'rocket', 'other');--> statement-breakpoint
CREATE TABLE "student_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_fee_id" uuid NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"payment_method" "student_payment_method" NOT NULL,
	"payment_date" date DEFAULT current_date NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"note" text,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_payments_amount_chk" CHECK ("student_payments"."amount" > 0 and "student_payments"."amount" < 'Infinity'::numeric)
);
--> statement-breakpoint
ALTER TABLE "student_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "student_fees_id_workspace_student_idx" ON "student_fees" USING btree ("id","workspace_id","student_id");--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_student_workspace_fk" FOREIGN KEY ("student_id","workspace_id") REFERENCES "public"."students"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_fee_workspace_student_fk" FOREIGN KEY ("student_fee_id","workspace_id","student_id") REFERENCES "public"."student_fees"("id","workspace_id","student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_payments_workspace_receipt_idx" ON "student_payments" USING btree ("workspace_id","receipt_number");--> statement-breakpoint
CREATE INDEX "student_payments_workspace_fee_idx" ON "student_payments" USING btree ("workspace_id","student_fee_id");--> statement-breakpoint
CREATE INDEX "student_payments_student_workspace_date_idx" ON "student_payments" USING btree ("student_id","workspace_id","payment_date");--> statement-breakpoint
CREATE INDEX "student_payments_workspace_date_idx" ON "student_payments" USING btree ("workspace_id","payment_date");--> statement-breakpoint
CREATE POLICY "student_payments_workspace_isolation" ON "student_payments" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("student_payments"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("student_payments"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "student_payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_payments" TO eduflow_app;
--> statement-breakpoint
INSERT INTO permissions (code, key, name, module, description) VALUES
  (1403, 'fees.collect', 'Collect student fees', 'fees', 'Record student fee payments and receipts.')
ON CONFLICT (code) DO UPDATE SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  description = EXCLUDED.description;
--> statement-breakpoint
INSERT INTO role_permissions (role_code, permission_code) VALUES (101, 1403)
ON CONFLICT DO NOTHING;
