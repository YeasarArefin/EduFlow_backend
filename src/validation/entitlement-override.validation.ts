import { z } from "zod";
import { bigintSchema, uuidSchema } from "./common.validation";

export const entitlementOverrideSchema = z
  .object({
    featureKey: z.string().trim().min(1).max(100),
    enabledOverride: z.boolean().nullable(),
    limitOverride: bigintSchema.nullable(),
    reason: z.string().trim().min(1).max(500),
    expiresAt: z.coerce.date().nullable()
  })
  .strict();
export const entitlementOverridePatchSchema = entitlementOverrideSchema.partial();
export const entitlementOverrideIdSchema = uuidSchema;
