export type ReceiptGateResult = Readonly<{ ok: boolean; managed: boolean; code?: string; ticket?: object }>;
export function sourceAllowsLiveReceipt(source: unknown, invoice: any): boolean;
export function createFirewoodReceiptSourceGate(dependencies: {
  readSendingContext: (mode: 'sending') => any; readPayment: (id: string) => Promise<any>;
  readInvoice: (id: string) => Promise<any>; readCollectorContext: (id: string) => Promise<any>; now?: () => number;
}): Readonly<{ beforeClaim(id: string, context: any): Promise<ReceiptGateResult>;
  beforeTransport(id: string, context: any, ticket?: object): Promise<ReceiptGateResult> }>;
