export const expensePaymentMethods = [
  'cash',
  'bkash',
  'nagad',
  'rocket',
  'bank_transfer',
  'card',
  'other',
] as const;

export const expenseStatuses = ['active', 'reversed'] as const;

export const expensePermissions = {
  view: { code: 1701, key: 'expenses.view' },
  manage: { code: 1702, key: 'expenses.manage' },
  reverse: { code: 1703, key: 'expenses.reverse' },
} as const;
