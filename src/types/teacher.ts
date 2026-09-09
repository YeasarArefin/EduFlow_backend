import type { teacherSalaries } from '../database/schema/teacher-salaries';
import type { z } from 'zod';
import type {
    createTeacherSchema,
    listTeachersQuerySchema,
    updateTeacherSchema,
} from '../validation/teacher.validation';
import type {
    recordTeacherSalaryPaymentSchema,
    teacherSalaryListQuerySchema,
} from '../validation/teacher-salary.validation';

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type ListTeachersInput = z.infer<typeof listTeachersQuerySchema>;
export type TeacherSalaryQuery = z.infer<typeof teacherSalaryListQuerySchema>;
export type TeacherSalary = typeof teacherSalaries.$inferSelect;
export type RecordTeacherSalaryPaymentInput = z.infer<typeof recordTeacherSalaryPaymentSchema>;
