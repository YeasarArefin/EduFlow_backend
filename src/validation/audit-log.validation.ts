import { z } from "zod";

export const activityQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().max(10_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().max(100).optional(),
    category: z.enum(["payment", "plan", "entitlement", "lifecycle"]).optional()
  })
  .strict();
