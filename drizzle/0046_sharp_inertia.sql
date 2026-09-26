ALTER TABLE "workspace_settings" ADD COLUMN "absence_sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "notice_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "notice_sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "notice_recipient" varchar(20) DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "payment_sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "reminder_sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "overdue_sms_enabled" boolean DEFAULT false NOT NULL;