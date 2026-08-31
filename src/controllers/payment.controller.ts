import type { RequestHandler } from "express";
import { z } from "zod";
import { createSubscriptionPaymentRequest, listPendingPaymentRequests, reviewPaymentRequest } from "../services/payment.service";

const createPaymentBodySchema = z.object({
  planId: z.string().uuid(),
  amount: z.union([
    z.number().int().nonnegative().safe(),
    z.string().regex(/^\d+$/),
  ]).transform((value) => BigInt(value)),
  paymentMethod: z.enum(["cash", "bkash", "nagad", "rocket", "other"]),
  senderNumber: z.string().trim().min(1).max(30),
  transactionId: z.string().trim().min(1).max(100),
}).strict();

export const createPaymentRequest: RequestHandler = async (req, res, next) => {
  const parsed = createPaymentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });
    return;
  }

  const context = req.workspaceContext;
  const user = req.authenticatedUser;
  if (!context || !user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid authentication session is required." } });
    return;
  }

  try {
    const paymentRequest = await createSubscriptionPaymentRequest(context.workspaceId, user.id, {
      planId: parsed.data.planId,
      amountMinor: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      senderNumber: parsed.data.senderNumber,
      transactionId: parsed.data.transactionId,
    });
    res.status(201).json({
      data: {
        ...paymentRequest,
        amountMinor: paymentRequest.amountMinor.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

function mapPayment(payment: { amountMinor: bigint; [key: string]: unknown }) {
  return { ...payment, amountMinor: payment.amountMinor.toString() };
}

export const listPendingPayments: RequestHandler = async (_req, res, next) => {
  try { res.status(200).json({ data: (await listPendingPaymentRequests()).map(mapPayment) }); } catch (error) { next(error); }
};

async function reviewPayment(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2], status: "approved" | "rejected") {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A valid payment request ID is required." } }); return; }
  const reason = status === "rejected" ? z.object({ rejectionReason: z.string().trim().min(1).max(500) }).strict().safeParse(req.body) : { success: true as const, data: {} };
  if (!reason.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } }); return; }
  try {
    const payment = await reviewPaymentRequest(id.data, req.authenticatedUser!.id, status, "rejectionReason" in reason.data ? reason.data.rejectionReason : undefined);
    res.status(200).json({ data: mapPayment(payment) });
  } catch (error) { next(error); }
}

export const approvePayment: RequestHandler = (req, res, next) => reviewPayment(req, res, next, "approved");
export const rejectPayment: RequestHandler = (req, res, next) => reviewPayment(req, res, next, "rejected");
