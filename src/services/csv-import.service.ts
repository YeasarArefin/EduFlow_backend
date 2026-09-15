import { parse } from 'csv-parse/sync';
import { and, eq, inArray } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { createStudentSchema } from '../validation/student.validation';
import { createTeacherSchema } from '../validation/teacher.validation';
import { students } from '../database/schema/students';
import { teachers } from '../database/schema/teachers';
import { createStudent } from './student.service';
import { createTeacher } from './teacher.service';
import type { CsvImportKind, CsvImportRow } from '../types/csv-import';

const chunkSize = 100;
const studentHeaders = ['student_code', 'full_name', 'email', 'student_phone', 'guardian_phone', 'guardian_name', 'admission_date', 'status', 'gender', 'address', 'notes'];
const teacherHeaders = ['teacher_code', 'full_name', 'phone_number', 'email_address', 'subject_specialty', 'default_salary', 'notes'];

function optional(value: string | undefined) { return value?.trim() || undefined; }
function errorsFrom(result: { error: { issues: { path: PropertyKey[]; message: string }[] } }) { return result.error.issues.map((issue) => ({ field: String(issue.path[0] ?? 'row'), reason: issue.message })); }
function normalize(kind: CsvImportKind, values: Record<string, string>) {
  if (kind === 'students') return { studentCode: optional(values.student_code), fullName: optional(values.full_name), email: optional(values.email), phone: optional(values.student_phone), guardianPhone: optional(values.guardian_phone), guardianName: optional(values.guardian_name), admissionDate: optional(values.admission_date), status: optional(values.status), gender: optional(values.gender), address: optional(values.address), notes: optional(values.notes) };
  return { teacherCode: optional(values.teacher_code), name: optional(values.full_name), phone: optional(values.phone_number), email: optional(values.email_address), subjectSpecialty: optional(values.subject_specialty), defaultSalaryMinor: optional(values.default_salary), notes: optional(values.notes) };
}

export function csvTemplate(kind: CsvImportKind) { return `${(kind === 'students' ? studentHeaders : teacherHeaders).join(',')}\n`; }

export async function previewCsvImport(workspaceId: string, kind: CsvImportKind, csv: string) {
  let rows: Record<string, string>[];
  try { rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: false }); } catch { return { rows: [{ rowNumber: 1, values: {}, errors: [{ field: 'csv', reason: 'CSV is malformed.' }] }], total: 0, valid: 0, invalid: 1 }; }
  const headers = kind === 'students' ? studentHeaders : teacherHeaders;
  const missing = headers.filter((header) => !Object.keys(rows[0] ?? {}).includes(header));
  if (missing.length) return { rows: [{ rowNumber: 1, values: {}, errors: missing.map((field) => ({ field, reason: 'Required column is missing.' })) }], total: rows.length, valid: 0, invalid: rows.length || 1 };
  const codeKey = kind === 'students' ? 'student_code' : 'teacher_code';
  const seen = new Set<string>();
  const codes = rows.map((row) => row[codeKey]?.trim()).filter(Boolean);
  const existing = kind === 'students'
    ? await withWorkspaceContext(workspaceId, (tx) => tx.select({ code: students.studentCode }).from(students).where(and(eq(students.workspaceId, workspaceId), inArray(students.studentCode, codes))))
    : await withWorkspaceContext(workspaceId, (tx) => tx.select({ code: teachers.teacherCode }).from(teachers).where(and(eq(teachers.workspaceId, workspaceId), inArray(teachers.teacherCode, codes))));
  const existingCodes = new Set(existing.map((row) => row.code));
  const previewRows: CsvImportRow[] = rows.map((values, index) => {
    const data = normalize(kind, values); const parsed = (kind === 'students' ? createStudentSchema : createTeacherSchema).safeParse(data);
    const rowErrors = parsed.success ? [] : errorsFrom(parsed);
    const code = values[codeKey]?.trim();
    if (code && (seen.has(code) || existingCodes.has(code))) rowErrors.push({ field: codeKey, reason: 'Code already exists in this import or workspace.' });
    if (code) seen.add(code);
    return { rowNumber: index + 2, values, errors: rowErrors };
  });
  return { rows: previewRows, total: previewRows.length, valid: previewRows.filter((row) => row.errors.length === 0).length, invalid: previewRows.filter((row) => row.errors.length > 0).length };
}

export async function importCsv(workspaceId: string, actorUserId: string, kind: CsvImportKind, csv: string) {
  const preview = await previewCsvImport(workspaceId, kind, csv); let imported = 0;
  for (let index = 0; index < preview.rows.length; index += chunkSize) for (const row of preview.rows.slice(index, index + chunkSize)) if (!row.errors.length) {
    const data = normalize(kind, row.values);
    if (kind === 'students') await createStudent(workspaceId, actorUserId, createStudentSchema.parse(data));
    else await createTeacher(workspaceId, createTeacherSchema.parse(data));
    imported += 1;
  }
  return { ...preview, imported, skipped: preview.invalid };
}
