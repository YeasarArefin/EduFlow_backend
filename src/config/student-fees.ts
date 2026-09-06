export const studentFeeStatuses = [
  "unpaid", "partially_paid", "paid", "overpaid", "waived", "overdue",
] as const;

export const studentFeePermissions = {
  view: { code: 1401, key: "fees.view" },
  generate: { code: 1402, key: "fees.generate" },
} as const;
