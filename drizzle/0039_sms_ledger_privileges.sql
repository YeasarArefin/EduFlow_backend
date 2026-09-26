-- Custom SQL migration file, put your code below! --
REVOKE DELETE ON TABLE sms_wallets FROM eduflow_app;
REVOKE UPDATE, DELETE ON TABLE sms_credit_ledger FROM eduflow_app;
