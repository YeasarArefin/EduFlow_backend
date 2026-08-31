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

const bangladeshiMobileNumberSchema = z.string().regex(/^(?:\+8801\d{9}|01\d{9})$/);

export const createWorkspaceOnboardingSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers, and hyphens."),
    phone: bangladeshiMobileNumberSchema.optional(),
    email: z.string().trim().email().max(255).optional(),
    address: z.string().trim().min(1).max(2_000).optional()
  })
  .strict();
