import { z } from 'zod';

const permissionCode = z.number().int().positive();
const uniqueCodes = <T extends { permissionCode: number }>(items: T[]) =>
  new Set(items.map((item) => item.permissionCode)).size === items.length;
const roleId = z.string().uuid();

export const permissionRoleIdSchema = roleId;
export const permissionMemberIdSchema = z.string().uuid();
export const createRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    description: z.string().trim().max(500).optional(),
    permissions: z
      .array(z.object({ permissionCode, allowed: z.boolean() }).strict())
      .max(200)
      .refine(uniqueCodes, 'Permission codes must be unique.'),
  })
  .strict();
export const updateRoleSchema = createRoleSchema;
export const updateMemberOverridesSchema = z
  .object({
    overrides: z
      .array(z.object({ permissionCode, allowed: z.boolean() }).strict())
      .max(200)
      .refine(uniqueCodes, 'Permission codes must be unique.'),
  })
  .strict();
