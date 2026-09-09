export const attendanceSessionStatuses = ['draft', 'finalized'] as const;
export const attendanceRecordStatuses = ['present', 'absent'] as const;

export const attendancePermissions = {
  view: { code: 1301, key: 'attendance.view' },
  mark: { code: 1302, key: 'attendance.mark' },
  update: { code: 1303, key: 'attendance.update' },
  finalize: { code: 1304, key: 'attendance.finalize' },
} as const;
