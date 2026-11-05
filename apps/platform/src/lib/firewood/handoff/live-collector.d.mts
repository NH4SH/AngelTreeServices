export function isLiveFirewoodInvoice(invoice: {document_terms_version?: string | null; invoice_number?: string | null}): boolean;
export function validateLiveCollectorContext(context: any, invoiceId: string): any;
export function liveSurchargeFields(policy: any, input: {principalCents: number; surchargeCents: number; funding: string; country: string}): Readonly<{amount: number; enforce_validation: 'enabled'}> | null;
