import { z } from 'zod';
import { attendanceRecordStatuses, attendanceSessionStatuses } from '../config/attendance';
import { uuidSchema } from './common.validation';

const dateSchema = z.iso.date();

export const createAttendanceSessionSchema = z
  .object({
    batchId: uuidSchema,
    sessionDate: dateSchema,
  })
  .strict();

export const attendanceSessionParamsSchema = z.object({ id: uuidSchema }).strict();

export const bulkSaveAttendanceSchema = z
  .object({
    records: z
      .array(
        z
          .object({
            studentId: uuidSchema,
            status: z.enum(attendanceRecordStatuses),
          })
          .strict()
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, record] of value.records.entries()) {
      if (ids.has(record.studentId)) {
        context.addIssue({
          code: 'custom',
          message: 'A student may appear only once.',
          path: ['records', index, 'studentId'],
        });
      }
      ids.add(record.studentId);
    }
  });

export const listAttendanceSessionsQuerySchema = z
  .object({
    batchId: uuidSchema.optional(),
    sessionDate: dateSchema.optional(),
    status: z.enum(attendanceSessionStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
