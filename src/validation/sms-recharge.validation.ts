import { z } from 'zod';
export const packageSchema = z.object({ name: z.string().trim().min(1).max(100), credits: z.coerce.bigint().positive(), priceMinor: z.coerce.bigint().min(0n), isActive: z.boolean().optional() }).strict();
export const rechargeSchema = z.object({ packageId: z.string().uuid(), paymentMethod: z.enum(['bkash','nagad','rocket','cash','other']), transactionId: z.string().trim().min(1).max(100) }).strict();
export const rejectionSchema = z.object({ rejectionReason: z.string().trim().min(1).max(500) }).strict();
