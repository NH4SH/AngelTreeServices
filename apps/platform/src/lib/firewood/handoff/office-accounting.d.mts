export type OfficeAccounting = Readonly<{issued_at: string; original_principal_cents: number;
  raw_balance_due_cents: number; credited_principal_cents: number; collectible_balance_cents: number; credit_id: string | null}>;
export const OFFICE_ACCOUNTING_KEYS: readonly string[];
export function validateOfficeAccounting(value: unknown, invoice?: any, previous?: OfficeAccounting | null): OfficeAccounting;
export function officeSettlementInvoice(invoice: any, accounting: OfficeAccounting): any;
