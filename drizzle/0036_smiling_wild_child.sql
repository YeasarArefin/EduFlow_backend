CREATE TYPE "public"."sms_credit_transaction_type" AS ENUM('purchase', 'usage', 'reservation', 'refund', 'bonus', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "sms_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"transaction_type" "sms_credit_transaction_type" NOT NULL,
	"available_credits_delta" bigint NOT NULL,
	"reserved_credits_delta" bigint DEFAULT 0 NOT NULL,
	"available_credits_after" bigint NOT NULL,
	"reserved_credits_after" bigint NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"idempotency_key" text,
	"actor_user_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_credit_ledger_after_balances_nonnegative_chk" CHECK ("sms_credit_ledger"."available_credits_after" >= 0 and "sms_credit_ledger"."reserved_credits_after" >= 0),
	CONSTRAINT "sms_credit_ledger_nonzero_change_chk" CHECK ("sms_credit_ledger"."available_credits_delta" <> 0 or "sms_credit_ledger"."reserved_credits_delta" <> 0)
);--> statement-breakpoint
CREATE TABLE "sms_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"available_credits" bigint DEFAULT 0 NOT NULL,
	"reserved_credits" bigint DEFAULT 0 NOT NULL,
	"purchased_credits" bigint DEFAULT 0 NOT NULL,
	"used_credits" bigint DEFAULT 0 NOT NULL,
	"refunded_credits" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_wallets_balances_nonnegative_chk" CHECK ("sms_wallets"."available_credits" >= 0 and "sms_wallets"."reserved_credits" >= 0 and "sms_wallets"."purchased_credits" >= 0 and "sms_wallets"."used_credits" >= 0 and "sms_wallets"."refunded_credits" >= 0)
);--> statement-breakpoint
ALTER TABLE "sms_credit_ledger" ADD CONSTRAINT "sms_credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_credit_ledger" ADD CONSTRAINT "sms_credit_ledger_wallet_id_sms_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."sms_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_wallets_id_workspace_idx" ON "sms_wallets" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "sms_credit_ledger" ADD CONSTRAINT "sms_credit_ledger_wallet_workspace_fk" FOREIGN KEY ("wallet_id","workspace_id") REFERENCES "public"."sms_wallets"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_wallets" ADD CONSTRAINT "sms_wallets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_credit_ledger_workspace_created_idx" ON "sms_credit_ledger" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_credit_ledger_wallet_created_idx" ON "sms_credit_ledger" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_credit_ledger_workspace_idempotency_idx" ON "sms_credit_ledger" USING btree ("workspace_id","idempotency_key") WHERE "sms_credit_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_wallets_workspace_idx" ON "sms_wallets" USING btree ("workspace_id");--> statement-breakpoint

INSERT INTO sms_wallets (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sms_wallets, sms_credit_ledger TO eduflow_app;--> statement-breakpoint
ALTER TABLE sms_wallets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sms_credit_ledger ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY sms_wallets_workspace_isolation ON sms_wallets AS PERMISSIVE FOR ALL TO eduflow_app
  USING (workspace_id = (select nullif(current_setting('app.workspace_id', true), '')::uuid))
  WITH CHECK (workspace_id = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY sms_credit_ledger_workspace_isolation ON sms_credit_ledger AS PERMISSIVE FOR ALL TO eduflow_app
  USING (workspace_id = (select nullif(current_setting('app.workspace_id', true), '')::uuid))
  WITH CHECK (workspace_id = (select nullif(current_setting('app.workspace_id', true), '')::uuid));--> statement-breakpoint

CREATE FUNCTION create_sms_wallet_for_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sms_wallets (workspace_id) VALUES (NEW.id) ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER workspaces_create_sms_wallet
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_sms_wallet_for_workspace();--> statement-breakpoint

CREATE FUNCTION sms_wallet_ledger_write_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.sms_wallet_ledger_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SMS wallet balances may only be changed through a ledgered transaction';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER sms_wallets_require_ledgered_write
  BEFORE UPDATE ON sms_wallets
  FOR EACH ROW EXECUTE FUNCTION sms_wallet_ledger_write_required();--> statement-breakpoint

CREATE FUNCTION sms_credit_ledger_is_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SMS credit ledger entries are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER sms_credit_ledger_prevent_mutation
  BEFORE UPDATE OR DELETE ON sms_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION sms_credit_ledger_is_immutable();
