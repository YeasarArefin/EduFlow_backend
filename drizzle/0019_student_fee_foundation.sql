CREATE TYPE "public"."fee_status" AS ENUM('unpaid', 'partially_paid', 'paid', 'overpaid', 'waived', 'overdue');--> statement-breakpoint
CREATE TABLE "student_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"fee_month" date NOT NULL,
	"expected_amount" numeric(19, 2) NOT NULL,
	"discount_amount" numeric(19, 2) DEFAULT '0.00' NOT NULL,
	"paid_amount" numeric(19, 2) DEFAULT '0.00' NOT NULL,
	"due_amount" numeric(19, 2) GENERATED ALWAYS AS (greatest(expected_amount - discount_amount - paid_amount, 0)) STORED NOT NULL,
	"status" "fee_status" DEFAULT 'unpaid' NOT NULL,
	"due_date" date NOT NULL,
	"grace_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_fees_month_start_chk" CHECK (extract(day from "student_fees"."fee_month") = 1),
	CONSTRAINT "student_fees_amounts_chk" CHECK ("student_fees"."expected_amount" >= 0 and "student_fees"."expected_amount" < 'Infinity'::numeric and "student_fees"."discount_amount" >= 0 and "student_fees"."discount_amount" <= "student_fees"."expected_amount" and "student_fees"."paid_amount" >= 0 and "student_fees"."paid_amount" < 'Infinity'::numeric),
	CONSTRAINT "student_fees_dates_chk" CHECK ("student_fees"."due_date" >= "student_fees"."fee_month" and "student_fees"."grace_date" >= "student_fees"."due_date"),
	CONSTRAINT "student_fees_status_amounts_chk" CHECK (
    ("student_fees"."status" = 'waived' and "student_fees"."expected_amount" = "student_fees"."discount_amount" and "student_fees"."paid_amount" = 0) or
    ("student_fees"."status" = 'paid' and "student_fees"."expected_amount" > "student_fees"."discount_amount" and "student_fees"."paid_amount" = "student_fees"."expected_amount" - "student_fees"."discount_amount") or
    ("student_fees"."status" = 'overpaid' and "student_fees"."paid_amount" > "student_fees"."expected_amount" - "student_fees"."discount_amount") or
    ("student_fees"."status" = 'unpaid' and "student_fees"."due_amount" > 0 and "student_fees"."paid_amount" = 0) or
    ("student_fees"."status" = 'partially_paid' and "student_fees"."due_amount" > 0 and "student_fees"."paid_amount" > 0) or
    ("student_fees"."status" = 'overdue' and "student_fees"."due_amount" > 0)
  )
);
--> statement-breakpoint
ALTER TABLE "student_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Referenced unique indexes must exist before adding the composite foreign keys.
CREATE UNIQUE INDEX "students_id_workspace_idx" ON "students" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_enrollments_id_workspace_student_idx" ON "batch_enrollments" USING btree ("id","workspace_id","student_id");--> statement-breakpoint
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_enrollment_workspace_student_fk" FOREIGN KEY ("enrollment_id","workspace_id","student_id") REFERENCES "public"."batch_enrollments"("id","workspace_id","student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_student_workspace_fk" FOREIGN KEY ("student_id","workspace_id") REFERENCES "public"."students"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_fees_enrollment_month_idx" ON "student_fees" USING btree ("enrollment_id","fee_month");--> statement-breakpoint
CREATE INDEX "student_fees_workspace_month_status_idx" ON "student_fees" USING btree ("workspace_id","fee_month","status");--> statement-breakpoint
CREATE INDEX "student_fees_student_workspace_month_idx" ON "student_fees" USING btree ("student_id","workspace_id","fee_month");--> statement-breakpoint
CREATE POLICY "student_fees_workspace_isolation" ON "student_fees" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("student_fees"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("student_fees"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "student_fees" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_fees" TO eduflow_app;
--> statement-breakpoint
INSERT INTO permissions (code, key, name, module, description) VALUES
  (1401, 'fees.view', 'View student fees', 'fees', 'View monthly student fee records.'),
  (1402, 'fees.generate', 'Generate student fees', 'fees', 'Generate monthly student fee snapshots.');
--> statement-breakpoint
INSERT INTO role_permissions (role_code, permission_code) VALUES (101, 1401), (101, 1402);

-- Rollback is intentionally manual: student_fees contains durable financial history.
-- Export and retain fee rows before dropping student_fees, fee_status, the two
-- referenced unique indexes, and the 1401/1402 permission grants in a rollback.
