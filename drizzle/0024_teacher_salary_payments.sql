CREATE TYPE "teacher_salary_payment_method" AS ENUM ('cash','bkash','nagad','rocket','other');
CREATE UNIQUE INDEX "teacher_salaries_id_workspace_idx" ON "teacher_salaries" ("id","workspace_id");
CREATE TABLE "teacher_salary_payments" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"), "teacher_salary_id" uuid NOT NULL, "amount" numeric(19,2) NOT NULL, "payment_method" "teacher_salary_payment_method" NOT NULL, "payment_date" date NOT NULL DEFAULT current_date, "note" text, "recorded_by_user_id" text, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "teacher_salary_payments_amount_chk" CHECK ("amount" > 0), CONSTRAINT "teacher_salary_payments_salary_workspace_fk" FOREIGN KEY ("teacher_salary_id","workspace_id") REFERENCES "teacher_salaries"("id","workspace_id"));
CREATE INDEX "teacher_salary_payments_workspace_salary_idx" ON "teacher_salary_payments" ("workspace_id","teacher_salary_id");
ALTER TABLE "teacher_salary_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_salary_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_salary_payments_workspace_isolation" ON "teacher_salary_payments" FOR ALL TO "eduflow_app" USING ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON "teacher_salary_payments" TO eduflow_app;
