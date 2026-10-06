import { z } from 'zod';

export const sessionTakeoverSchema = z
  .object({
    email: z.string().trim().email('A valid email is required.'),
    password: z.string().min(1, 'Password is required.'),
  })
  .strict();

export const activeDevicesQuerySchema = z
  .object({
    email: z.string().trim().email('A valid email is required.'),
    password: z.string().min(1, 'Password is required.'),
  })
  .strict();
