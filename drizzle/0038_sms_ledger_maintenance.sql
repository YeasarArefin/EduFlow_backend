-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION sms_credit_ledger_is_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.sms_wallet_ledger_maintenance', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'SMS credit ledger entries are immutable';
END;
$$;
