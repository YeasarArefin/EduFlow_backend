CREATE OR REPLACE FUNCTION public.enforce_session_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_limit integer := 2;
  active_session_count integer;
BEGIN
  -- This transaction-scoped lock serializes concurrent session inserts for one user.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));

  SELECT count(*) INTO active_session_count
  FROM session
  WHERE user_id = NEW.user_id AND expires_at > now();

  IF active_session_count >= session_limit THEN
    RAISE EXCEPTION 'SESSION_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
