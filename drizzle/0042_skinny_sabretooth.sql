ALTER TYPE "public"."sms_recipient_status" ADD VALUE 'processing' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "sms_messages" ALTER COLUMN "credits_used" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sms_messages" ALTER COLUMN "credits_refunded" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_credit_amounts_nonnegative_chk" CHECK ("sms_messages"."credits_required" >= 0 and "sms_messages"."credits_reserved" >= 0 and "sms_messages"."credits_used" >= 0 and "sms_messages"."credits_refunded" >= 0);--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_recipient_count_positive_chk" CHECK ("sms_messages"."recipient_count" > 0);--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_segments_positive_chk" CHECK ("sms_recipients"."segments" > 0);--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_credits_positive_chk" CHECK ("sms_recipients"."credits" > 0);