import type { batchEnrollments } from '../database/schema/batches';
import type { z } from 'zod';
import type {
    createBatchSchema,
    listBatchesQuerySchema,
    updateBatchSchema,
} from '../validation/batch.validation';

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type ListBatchesInput = z.infer<typeof listBatchesQuerySchema>;
export type BatchTeacherAssignmentInput = { teacherId: string; isPrimary: boolean };
export type BatchEnrollmentRow = Pick<
    typeof batchEnrollments.$inferSelect,
    'id' | 'studentId' | 'enrolledAt' | 'status' | 'feeOverrideMinor' | 'discountMinor' | 'createdAt' | 'updatedAt'
> & { studentCode: string; name: string; phone: string | null };
