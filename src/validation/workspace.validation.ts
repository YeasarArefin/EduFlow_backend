import { z } from "zod";
import { uuidSchema } from "./common.validation";
import { workspaceListAccessStatuses, workspaceListSubscriptionStatuses } from "../services/workspace-list.service";

export const workspaceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(150).optional(),
    subscriptionStatus: z.enum(workspaceListSubscriptionStatuses).optional(),
    accessStatus: z.enum(workspaceListAccessStatuses).optional()
  })
  .strict();
export const workspaceIdSchema = uuidSchema;
