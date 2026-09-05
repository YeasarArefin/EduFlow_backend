import { z } from "zod";

export const academicResourceSchema = z.enum(["class-levels", "mediums", "academic-groups"]);
export const academicIdSchema = z.string().uuid();
export const createAcademicReferenceSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const renameAcademicReferenceSchema = createAcademicReferenceSchema;
export const updateAcademicReferenceStatusSchema = z.object({ isActive: z.boolean() }).strict();
