ALTER TABLE "students" ALTER COLUMN "gender" SET DATA TYPE text;--> statement-breakpoint
UPDATE "students" SET "gender" = NULL WHERE "gender" = 'other';--> statement-breakpoint
DROP TYPE "public"."student_gender";--> statement-breakpoint
CREATE TYPE "public"."student_gender" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "gender" SET DATA TYPE "public"."student_gender" USING "gender"::"public"."student_gender";--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "email" varchar(255);
