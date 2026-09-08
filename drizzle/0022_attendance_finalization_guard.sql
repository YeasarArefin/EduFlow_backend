-- Custom SQL migration file, put your code below! --
CREATE FUNCTION prevent_finalized_attendance_session_reopen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'finalized' AND NEW.status <> 'finalized' THEN
    RAISE EXCEPTION 'A finalized attendance session cannot be reopened'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION prevent_finalized_attendance_record_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance_sessions
    WHERE id = OLD.attendance_session_id
      AND workspace_id = OLD.workspace_id
      AND status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'Attendance records cannot change after finalization'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER attendance_sessions_prevent_reopen
BEFORE UPDATE OF status ON attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION prevent_finalized_attendance_session_reopen();--> statement-breakpoint

CREATE TRIGGER attendance_records_prevent_finalized_change
BEFORE UPDATE OR DELETE ON attendance_records
FOR EACH ROW
EXECUTE FUNCTION prevent_finalized_attendance_record_change();
