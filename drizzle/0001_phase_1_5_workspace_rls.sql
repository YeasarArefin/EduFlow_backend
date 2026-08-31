DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eduflow_app') THEN
    CREATE ROLE eduflow_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO eduflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_settings, workspace_members, member_permission_overrides TO eduflow_app;

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_settings_workspace_isolation ON workspace_settings
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY workspace_members_workspace_isolation ON workspace_members
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY member_permission_overrides_workspace_isolation ON member_permission_overrides
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
