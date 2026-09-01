import { z } from "zod";
import { uuidSchema } from "./common.validation";

export const createPaymentBodySchema = z
  .object({
    planId: uuidSchema,
    amount: z
      .union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)])
      .transform((value) => BigInt(value)),
    paymentMethod: z.enum(["cash", "bkash", "nagad", "rocket", "other"]),
    senderNumber: z.string().trim().min(1).max(30),
    transactionId: z.string().trim().min(1).max(100)
  })
  .strict();

export const paymentRequestIdSchema = uuidSchema;
export const rejectionBodySchema = z.object({ rejectionReason: z.string().trim().min(1).max(500) }).strict();
export const revenueOverviewQuerySchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "The start date must not be after the end date." });
