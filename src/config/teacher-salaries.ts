export const teacherSalaryStatuses = [
  'pending',
  'partially_paid',
  'paid',
  'overdue',
  'waived',
] as const;

// Salary uses the established finance permissions until dedicated salary roles are introduced.
export const teacherSalaryPermissions = {
  view: { key: 'fees.view' },
  generate: { key: 'fees.generate' },
  pay: { key: 'fees.collect' },
} as const;
