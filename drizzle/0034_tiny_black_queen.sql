CREATE TYPE "public"."expense_payment_method" AS ENUM('cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('active', 'reversed');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"expense_date" date DEFAULT current_date NOT NULL,
	"payment_method" "expense_payment_method" NOT NULL,
	"description" text,
	"recorded_by_user_id" text NOT NULL,
	"status" "expense_status" DEFAULT 'active' NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" text,
	"reversal_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_chk" CHECK ("expenses"."amount" > 0 and "expenses"."amount" < 'Infinity'::numeric),
	CONSTRAINT "expenses_reversal_chk" CHECK (("expenses"."status" = 'active' and "expenses"."reversed_at" is null and "expenses"."reversed_by_user_id" is null and "expenses"."reversal_reason" is null) or ("expenses"."status" = 'reversed' and "expenses"."reversed_at" is not null and "expenses"."reversed_by_user_id" is not null and "expenses"."reversal_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_workspace_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "public"."expense_categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_workspace_name_idx" ON "expense_categories" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "expense_categories_workspace_active_idx" ON "expense_categories" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE INDEX "expenses_workspace_date_idx" ON "expenses" USING btree ("workspace_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_workspace_category_date_idx" ON "expenses" USING btree ("workspace_id","category_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_workspace_status_date_idx" ON "expenses" USING btree ("workspace_id","status","expense_date");--> statement-breakpoint
CREATE POLICY "expense_categories_workspace_isolation" ON "expense_categories" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("expense_categories"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("expense_categories"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "expenses_workspace_isolation" ON "expenses" AS PERMISSIVE FOR ALL TO "eduflow_app" USING ("expenses"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid)) WITH CHECK ("expenses"."workspace_id" = (select nullif(current_setting('app.workspace_id', true), '')::uuid));