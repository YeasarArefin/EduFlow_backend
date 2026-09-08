export const studentFeeStatuses = [
  "unpaid", "partially_paid", "paid", "overpaid", "waived", "overdue",
] as const;

export const studentPaymentMethods = [
  "cash", "bkash", "nagad", "rocket", "other",
] as const;

export const studentFeePermissions = {
  view: { code: 1401, key: "fees.view" },
  generate: { code: 1402, key: "fees.generate" },
  collect: { code: 1403, key: "fees.collect" },
} as const;

