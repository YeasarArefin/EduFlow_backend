ALTER TABLE "workspace_settings" ADD COLUMN "payment_reminder_days_before" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "grace_reminder_days_after" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "overdue_warning_days_after" smallint DEFAULT 1 NOT NULL;