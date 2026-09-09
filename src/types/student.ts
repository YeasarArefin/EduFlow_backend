import type { studentFees, studentPayments } from '../database/schema/fees';
import type { z } from 'zod';
import type {
    createStudentSchema,
    listStudentsQuerySchema,
    updateStudentSchema,
} from '../validation/student.validation';
import type { feeHistoryQuerySchema } from '../validation/student-fee.validation';
import type {
    recordStudentPaymentSchema,
    studentPaymentHistoryQuerySchema,
} from '../validation/student-payment.validation';

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsInput = z.infer<typeof listStudentsQuerySchema>;
export type StudentFee = typeof studentFees.$inferSelect;
export type StudentFeeQuery = z.infer<typeof feeHistoryQuerySchema>;
export type StudentPayment = typeof studentPayments.$inferSelect;
export type RecordStudentPaymentInput = z.infer<typeof recordStudentPaymentSchema>;
export type StudentPaymentQuery = z.infer<typeof studentPaymentHistoryQuerySchema>;
