DO $$ BEGIN
  CREATE TYPE "teacher_salary_status" AS ENUM ('pending', 'partially_paid', 'paid', 'overdue', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX "teachers_id_workspace_idx" ON "teachers" ("id", "workspace_id");
CREATE TABLE "teacher_salaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "teacher_id" uuid NOT NULL,
  "salary_month" date NOT NULL,
  "expected_salary" numeric(19,2) NOT NULL,
  "adjustment_amount" numeric(19,2) DEFAULT '0.00' NOT NULL,
  "paid_amount" numeric(19,2) DEFAULT '0.00' NOT NULL,
  "due_amount" numeric(19,2) GENERATED ALWAYS AS (greatest(expected_salary + adjustment_amount - paid_amount, 0)) STORED NOT NULL,
  "status" "teacher_salary_status" DEFAULT 'pending' NOT NULL,
  "payment_start_date" date NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "teacher_salaries_teacher_workspace_fk" FOREIGN KEY ("teacher_id", "workspace_id") REFERENCES "teachers"("id", "workspace_id"),
  CONSTRAINT "teacher_salaries_month_start_chk" CHECK (extract(day from "salary_month") = 1),
  CONSTRAINT "teacher_salaries_amounts_chk" CHECK ("expected_salary" >= 0 AND "expected_salary" < 'Infinity'::numeric AND "adjustment_amount" >= -"expected_salary" AND "adjustment_amount" < 'Infinity'::numeric AND "paid_amount" >= 0 AND "paid_amount" < 'Infinity'::numeric),
  CONSTRAINT "teacher_salaries_payment_start_chk" CHECK ("payment_start_date" >= "salary_month")
);
CREATE UNIQUE INDEX "teacher_salaries_teacher_month_idx" ON "teacher_salaries" ("teacher_id", "salary_month");
CREATE INDEX "teacher_salaries_workspace_month_status_idx" ON "teacher_salaries" ("workspace_id", "salary_month", "status");
CREATE INDEX "teacher_salaries_teacher_workspace_month_idx" ON "teacher_salaries" ("teacher_id", "workspace_id", "salary_month");
ALTER TABLE "teacher_salaries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_salaries_workspace_isolation" ON "teacher_salaries" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
ALTER TABLE "teacher_salaries" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "teacher_salaries" TO eduflow_app;
