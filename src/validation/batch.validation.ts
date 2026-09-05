import { z } from "zod";

const batchStatusSchema = z.enum(["active", "inactive", "archived"]);
const nullableAcademicId = z.string().uuid().nullable().optional();
const nullableDate = z.iso.date().nullable().optional();

export function takaToMinor(val: number | string | bigint): bigint {
  if (typeof val === "bigint") return val;
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.round(num * 100));
}

const feeTakaSchema = z.union([
  z.number().min(0),
  z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "Must be a valid non-negative amount in Taka."),
]);

export const createBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    classLevelId: z.string().uuid(),
    mediumId: nullableAcademicId,
    academicGroupId: nullableAcademicId,
    startDate: nullableDate,
    monthlyFee: feeTakaSchema.optional(),
    monthlyFeeMinor: z.coerce.bigint().min(0n).optional(),
    status: batchStatusSchema.optional(),
  })
  .strict()
  .refine(
    (data) => data.monthlyFee !== undefined || data.monthlyFeeMinor !== undefined,
    {
      message: "Monthly fee (in Taka) or monthly fee minor (in poisha) is required.",
      path: ["monthlyFee"],
    },
  )
  .transform((data) => ({
    name: data.name,
    classLevelId: data.classLevelId,
    mediumId: data.mediumId ?? null,
    academicGroupId: data.academicGroupId ?? null,
    startDate: data.startDate ?? null,
    monthlyFeeMinor:
      data.monthlyFee !== undefined
        ? takaToMinor(data.monthlyFee)
        : data.monthlyFeeMinor!,
    status: data.status,
  }));

export const updateBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    classLevelId: z.string().uuid().optional(),
    mediumId: nullableAcademicId,
    academicGroupId: nullableAcademicId,
    startDate: nullableDate,
    monthlyFee: feeTakaSchema.optional(),
    monthlyFeeMinor: z.coerce.bigint().min(0n).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .transform((data) => {
    const result: {
      name?: string;
      classLevelId?: string;
      mediumId?: string | null;
      academicGroupId?: string | null;
      startDate?: string | null;
      monthlyFeeMinor?: bigint;
      status?: "active" | "inactive";
    } = {};

    if (data.name !== undefined) result.name = data.name;
    if (data.classLevelId !== undefined) result.classLevelId = data.classLevelId;
    if (data.mediumId !== undefined) result.mediumId = data.mediumId;
    if (data.academicGroupId !== undefined) result.academicGroupId = data.academicGroupId;
    if (data.startDate !== undefined) result.startDate = data.startDate;
    if (data.status !== undefined) result.status = data.status;

    if (data.monthlyFee !== undefined) {
      result.monthlyFeeMinor = takaToMinor(data.monthlyFee);
    } else if (data.monthlyFeeMinor !== undefined) {
      result.monthlyFeeMinor = data.monthlyFeeMinor;
    }

    return result;
  });

export const batchIdSchema = z.string().uuid();
export const listBatchesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    status: batchStatusSchema.optional(),
  })
  .strict();
