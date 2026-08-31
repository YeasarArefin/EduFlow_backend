import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const bigintSchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform((value) => BigInt(value));
