import { z } from "zod";
import { bigintSchema, uuidSchema } from "./common.validation";

const featureSchema = z
  .object({ featureKey: z.string().trim().min(1).max(100), enabled: z.boolean(), limitValue: bigintSchema.nullable() })
  .strict();
export const planSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    priceMinor: bigintSchema,
    durationDays: z.number().int().nonnegative(),
    trialDays: z.number().int().nonnegative(),
    isActive: z.boolean().optional(),
    features: z.array(featureSchema).max(100).optional()
  })
  .strict();
export const createPlanSchema = planSchema;
export const updatePlanSchema = planSchema.partial();
export const planIdSchema = uuidSchema;
