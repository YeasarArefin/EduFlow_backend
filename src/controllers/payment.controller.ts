import type { RequestHandler } from "express";
import {
  createSubscriptionPaymentRequest,
  getLatestAccountSubscriptionPaymentRequest,
  getLatestSubscriptionPaymentRequest,
  listPendingPaymentRequests,
  reviewPaymentRequest
} from "../services/payment.service";
import { getRevenueOverview as getRevenueOverviewService } from "../services/revenue-overview.service";
import { createPaymentBodySchema, paymentRequestIdSchema, rejectionBodySchema, revenueOverviewQuerySchema } from "../validation/payment.validation";

export const createPaymentRequest: RequestHandler = async (req, res, next) => {
  const parsed = createPaymentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }

  const context = req.workspaceContext;
  const user = req.authenticatedUser;
  if (!context || !user) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid authentication session is required."
      }
    });
    return;
  }

  try {
    const paymentRequest = await createSubscriptionPaymentRequest(context.workspaceId, user.id, {
      planId: parsed.data.planId,
      amountMinor: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      senderNumber: parsed.data.senderNumber,
      transactionId: parsed.data.transactionId
    });
    res.status(201).json({
      data: {
        ...paymentRequest,
        amountMinor: paymentRequest.amountMinor.toString()
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createAccountPaymentRequest: RequestHandler = async (req, res, next) => {
  const parsed = createPaymentBodySchema.safeParse(req.body);
  const user = req.authenticatedUser;
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });
    return;
  }
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid authentication session is required." } });
    return;
  }

  try {
    const paymentRequest = await createSubscriptionPaymentRequest(null, user.id, {
      planId: parsed.data.planId,
      amountMinor: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      senderNumber: parsed.data.senderNumber,
      transactionId: parsed.data.transactionId
    });
    res.status(201).json({ data: { ...paymentRequest, amountMinor: paymentRequest.amountMinor.toString() } });
  } catch (error) {
    next(error);
  }
};

function mapPayment(payment: { amountMinor: bigint; [key: string]: unknown } | null) {
  return payment ? { ...payment, amountMinor: payment.amountMinor.toString() } : null;
}

export const getLatestPayment: RequestHandler = async (req, res, next) => {
  const context = req.workspaceContext;
  if (!context) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid authentication session is required."
      }
    });
    return;
  }

  try {
    const payment = await getLatestSubscriptionPaymentRequest(context.workspaceId);
    res.status(200).json({ data: mapPayment(payment) });
  } catch (error) {
    next(error);
  }
}

export const getLatestAccountPayment: RequestHandler = async (req, res, next) => {
  const user = req.authenticatedUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid authentication session is required." } });
    return;
  }
  try {
    res.status(200).json({ data: mapPayment(await getLatestAccountSubscriptionPaymentRequest(user.id)) });
  } catch (error) {
    next(error);
  }
};

export const listPendingPayments: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({
      data: (await listPendingPaymentRequests()).map(mapPayment)
    });
  } catch (error) {
    next(error);
  }
};

export const getRevenueOverview: RequestHandler = async (req, res, next) => {
  const parsed = revenueOverviewQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } }); return; }
  try {
    const from = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00.000Z`) : undefined;
    const to = parsed.data.to ? new Date(`${parsed.data.to}T00:00:00.000Z`) : undefined;
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    res.status(200).json({ data: await getRevenueOverviewService({ from, to }) });
  } catch (error) { next(error); }
};

async function reviewPayment(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
  status: "approved" | "rejected"
) {
  const id = paymentRequestIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid payment request ID is required."
      }
    });
    return;
  }
  const reason = status === "rejected" ? rejectionBodySchema.safeParse(req.body) : { success: true as const, data: {} };
  if (!reason.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    const payment = await reviewPaymentRequest(
      id.data,
      req.authenticatedUser!.id,
      status,
      "rejectionReason" in reason.data ? reason.data.rejectionReason : undefined
    );
    res.status(200).json({ data: mapPayment(payment) });
  } catch (error) {
    next(error);
  }
}

export const approvePayment: RequestHandler = (req, res, next) => reviewPayment(req, res, next, "approved");
export const rejectPayment: RequestHandler = (req, res, next) => reviewPayment(req, res, next, "rejected");
