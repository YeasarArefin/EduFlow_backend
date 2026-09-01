ALTER TABLE "payment_requests" DROP CONSTRAINT "payment_requests_reviewed_by_user_id_platform_owners_user_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reviewed_by_user_id_platform_owners_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."platform_owners"("user_id") ON DELETE no action ON UPDATE cascade;