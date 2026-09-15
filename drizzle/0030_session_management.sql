CREATE INDEX "session_user_expires_at_idx" ON "session" USING btree ("user_id","expires_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_session_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_limit integer;
  active_session_count integer;
BEGIN
  -- This transaction-scoped lock serializes concurrent session inserts for one user.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));

  SELECT CASE WHEN EXISTS (SELECT 1 FROM platform_owners WHERE user_id = NEW.user_id)
                    OR EXISTS (
                      SELECT 1 FROM workspace_members
                      WHERE user_id = NEW.user_id AND role_code = 101 AND status = 'active'
                    )
              THEN 2 ELSE 1 END
  INTO session_limit;

  SELECT count(*) INTO active_session_count
  FROM session
  WHERE user_id = NEW.user_id AND expires_at > now();

  IF active_session_count >= session_limit THEN
    RAISE EXCEPTION 'SESSION_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER session_limit_before_insert
BEFORE INSERT ON session
FOR EACH ROW EXECUTE FUNCTION public.enforce_session_limit();
