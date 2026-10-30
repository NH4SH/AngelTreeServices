export type FirewoodDocumentAccounting = Readonly<{
  kind: "unconfirmed" | "credited" | "confirmed";
  statusLabel: string;
  paidCents: number;
  creditCents: number;
  retainedCents: number | null;
  balanceDueCents: number | null;
  canRequestPayment: boolean;
}>;
export function isLiveFirewoodInvoice(invoice: { invoice_number?: string | null; document_terms_version?: string | null }): boolean;
export function unconfirmedFirewoodDocument(): FirewoodDocumentAccounting;
export function firewoodInvoiceDocumentAccounting(invoice: { id: string; invoice_number: string | null; document_terms_version?: string | null; total_cents: number }, context: unknown): FirewoodDocumentAccounting | null;
