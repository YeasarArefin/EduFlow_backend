ALTER TABLE "workspace_settings" ADD COLUMN "payment_confirmation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "payment_reminder_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "grace_reminder_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "overdue_warning_enabled" boolean DEFAULT true NOT NULL;