import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../database/client";
import { paymentRequests, plans, subscriptions } from "../database/schema/subscriptions";
import { AppError } from "../middleware/error-handler";

export type CreateSubscriptionPaymentInput = {
  planId: string;
  amountMinor: bigint;
  paymentMethod: "cash" | "bkash" | "nagad" | "rocket" | "other";
  senderNumber: string;
  transactionId: string;
};

export async function createSubscriptionPaymentRequest(
  workspaceId: string,
  requestedByUserId: string,
  input: CreateSubscriptionPaymentInput
) {
  try {
    const [paymentRequest] = await db
      .insert(paymentRequests)
      .values({
        workspaceId,
        requestedByUserId,
        purpose: "subscription",
        planId: input.planId,
        amountMinor: input.amountMinor,
        method: input.paymentMethod,
        senderBkashNumber: input.senderNumber,
        transactionId: input.transactionId,
        status: "pending"
      })
      .returning({
        id: paymentRequests.id,
        planId: paymentRequests.planId,
        amountMinor: paymentRequests.amountMinor,
        paymentMethod: paymentRequests.method,
        senderNumber: paymentRequests.senderBkashNumber,
        transactionId: paymentRequests.transactionId,
        status: paymentRequests.status,
        createdAt: paymentRequests.createdAt
      });

    return paymentRequest;
  } catch (error) {
    const databaseError =
      error && typeof error === "object" ? (error as { code?: string; cause?: { code?: string } }) : undefined;
    const databaseErrorCode = databaseError?.code ?? databaseError?.cause?.code;
    if (databaseErrorCode === "23505") {
      throw new AppError(
        "PAYMENT_TRANSACTION_ALREADY_EXISTS",
        "A payment with this transaction ID already exists.",
        409
      );
    }
    if (databaseErrorCode === "23503") {
      throw new AppError("PAYMENT_PLAN_NOT_FOUND", "The selected subscription plan was not found.", 400);
    }
    throw error;
  }
}

export async function listPendingPaymentRequests() {
  return db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.status, "pending"))
    .orderBy(desc(paymentRequests.createdAt));
}

export async function reviewPaymentRequest(
  id: string,
  reviewerUserId: string,
  status: "approved" | "rejected",
  rejectionReason?: string
) {
  return db.transaction(async (transaction) => {
    const [payment] = await transaction.select().from(paymentRequests).where(eq(paymentRequests.id, id)).for("update");

    if (!payment || payment.status !== "pending") {
      throw new AppError(
        "PAYMENT_ALREADY_REVIEWED",
        "This payment request has already been reviewed or does not exist.",
        409
      );
    }

    const reviewedAt = new Date();
    if (status === "approved") {
      if (payment.purpose !== "subscription" || !payment.planId) {
        throw new AppError(
          "PAYMENT_SUBSCRIPTION_REQUIRED",
          "Only subscription payments with a selected plan can be approved.",
          400
        );
      }

      const [plan] = await transaction
        .select({ durationDays: plans.durationDays })
        .from(plans)
        .where(eq(plans.id, payment.planId))
        .limit(1);
      if (!plan) throw new AppError("PAYMENT_PLAN_NOT_FOUND", "The selected subscription plan was not found.", 400);

      const expiresAt = new Date(reviewedAt);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.durationDays);
      await transaction
        .update(subscriptions)
        .set({ status: "expired", updatedAt: reviewedAt })
        .where(
          and(
            eq(subscriptions.workspaceId, payment.workspaceId),
            sql`${subscriptions.status} in ('trial', 'pending', 'active', 'renewal_due')`
          )
        );
      await transaction.insert(subscriptions).values({
        workspaceId: payment.workspaceId,
        planId: payment.planId,
        status: "active",
        startsAt: reviewedAt,
        expiresAt,
        renewalDueAt: expiresAt
      });
    }

    const [reviewedPayment] = await transaction
      .update(paymentRequests)
      .set({
        status,
        reviewedAt,
        reviewedByUserId: reviewerUserId,
        rejectionReason: rejectionReason ?? null,
        updatedAt: reviewedAt
      })
      .where(and(eq(paymentRequests.id, id), eq(paymentRequests.status, "pending")))
      .returning();
    return reviewedPayment;
  });
}
