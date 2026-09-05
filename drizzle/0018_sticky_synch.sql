ALTER TYPE "public"."enrollment_status" ADD VALUE 'archived';--> statement-breakpoint
UPDATE "batch_enrollments" SET "enrolled_at" = CURRENT_DATE WHERE "enrolled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ALTER COLUMN "enrolled_at" SET DEFAULT CURRENT_DATE;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ALTER COLUMN "enrolled_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD COLUMN "fee_override_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD COLUMN "discount_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_enrollments_one_active_idx" ON "batch_enrollments" USING btree ("student_id","batch_id") WHERE "batch_enrollments"."status" = 'active';--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_fee_override_nonnegative_chk" CHECK ("batch_enrollments"."fee_override_minor" IS NULL OR "batch_enrollments"."fee_override_minor" >= 0);--> statement-breakpoint
ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_discount_nonnegative_chk" CHECK ("batch_enrollments"."discount_minor" IS NULL OR "batch_enrollments"."discount_minor" >= 0);
