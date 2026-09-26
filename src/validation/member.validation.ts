import { z } from 'zod';

export const memberStatuses = ['active', 'suspended', 'removed'] as const;
const roleId = z.string().uuid();

export const memberIdSchema = z.string().uuid();
export const listMembersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    roleId: roleId.optional(),
    status: z.enum(memberStatuses).optional(),
  })
  .strict();

export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    roleId,
  })
  .strict();

export const updateMemberRoleSchema = z.object({ roleId }).strict();
export const updateMemberStatusSchema = z
  .object({ status: z.enum(['active', 'suspended']) })
  .strict();
