import { z } from 'zod';
import { uuidSchema } from './common.validation';
import {
  workspaceListAccessStatuses,
  workspaceListSubscriptionStatuses,
  workspaceListWorkspaceStatuses,
} from '../services/workspace-list.service';

export const workspaceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(150).optional(),
    workspaceStatus: z.enum(workspaceListWorkspaceStatuses).optional(),
    subscriptionStatus: z.enum(workspaceListSubscriptionStatuses).optional(),
    accessStatus: z.enum(workspaceListAccessStatuses).optional(),
    lifecycleQueue: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export const workspaceIdSchema = uuidSchema;

const dashboardMonthSchema = z.iso
  .date()
  .regex(/^[1-9]\d{3}-\d{2}-01$/, 'Month must be the first day of a month.')
  .refine((value) => value <= '9998-12-01', 'Month must be before year 9999.');

export const workspaceDashboardQuerySchema = z
  .object({
    month: dashboardMonthSchema.optional(),
    batchId: uuidSchema.optional(),
  })
  .strict();

const bangladeshiMobileNumberSchema = z.string().regex(/^(?:\+8801\d{9}|01\d{9})$/);

export const createWorkspaceOnboardingSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must use lowercase letters, numbers, and hyphens.'
      ),
    phone: bangladeshiMobileNumberSchema.optional(),
    email: z.string().trim().email().max(255).optional(),
    address: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
