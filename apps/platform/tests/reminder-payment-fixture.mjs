import {netSuccessfulPaymentPrincipal} from '../src/lib/payments/payment-accounting.ts';

// Test double for legacy in-memory queue fixtures, whose record IDs are intentionally synthetic.
// Actual snapshot validation and installed SQL are exercised separately with real UUIDs.
export async function memoryPaymentPrincipal(db,invoiceId) {
 const result=await db.from('payments').select('*').eq('invoice_id',invoiceId).eq('status','succeeded');
 return result.error?{error:'Synthetic payment read failure',totalCents:0}:{error:null,totalCents:(result.data??[]).reduce((sum,p)=>sum+netSuccessfulPaymentPrincipal(p),0)};
}
