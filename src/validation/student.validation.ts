import { z } from "zod";

const bangladeshPhone = /^(?:\+8801\d{9}|01\d{9})$/;
const optionalPhone = z.string().trim().regex(bangladeshPhone, "Enter a valid Bangladeshi mobile number.").optional().nullable();
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const studentFields = {
  studentCode: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(150),
  phone: optionalPhone,
  guardianName: optionalText(150),
  guardianPhone: optionalPhone,
  address: optionalText(2_000),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  admissionDate: z.string().date().optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  notes: optionalText(5_000)
};

export const createStudentSchema = z.object(studentFields).strict();
export const updateStudentSchema = z.object(studentFields).partial().strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided."
});
export const studentIdSchema = z.string().uuid();
export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional()
}).strict();
