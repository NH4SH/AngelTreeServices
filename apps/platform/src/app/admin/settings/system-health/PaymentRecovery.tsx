import Link from "next/link";
import { safeStaffMessage } from "@/lib/security/errors";
import { RetryWebhook } from "./RetryWebhook";

type Receipt = {
  event_id: string; event_type: string; state: string; phase: string; attempts: number;
  lease_active: boolean; last_problem: string | null; received_at: string; processed_at: string | null;
  invoice_id: string | null; email_review_count: number; email_failed_count: number;
};
export function PaymentRecovery({ receipts, error }: { receipts: Receipt[]; error: string | null }) {
  const attention = receipts.filter(row => !row.processed_at || Number(row.email_review_count)>0 || Number(row.email_failed_count)>0);
  return (
    <section className="system-health-section payment-recovery" aria-labelledby="payment-recovery-heading">
      <div className="system-health-section-heading"><h2 id="payment-recovery-heading">Payment processing</h2></div>
      {error ? <p className="form-message error" role="alert">{safeStaffMessage(error, "Payment processing history is unavailable. Please try again.")}</p> : (
        <>
          <p>{attention.length ? `${attention.length} recent payment event${attention.length === 1 ? " needs" : "s need"} attention.` : "No recent payment events need attention."}</p>
          <details>
            <summary>Review payment processing history</summary>
            <p>Most recent 100 events, with unfinished work first. Retrying finishes saved work; it does not charge a customer or resend an uncertain email.</p>
            {receipts.length ? (
              <>
                <ReceiptList receipts={receipts.slice(0,10)} />
                {receipts.length>10 ? <details><summary>More processing history ({receipts.length-10})</summary><ReceiptList receipts={receipts.slice(10)} /></details> : null}
              </>
            ) : <p>No payment events recorded yet.</p>}
          </details>
        </>
      )}
    </section>
  );
}
function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  return <ul className="payment-recovery-list">{receipts.map(row => (
    <li key={row.event_id}>
      <div>
        <strong>{receiptStatus(row)}</strong>
        <p>{eventLabel(row.event_type)} · <time dateTime={row.received_at}>{new Date(row.received_at).toLocaleString("en-US", {timeZone:"America/New_York",timeZoneName:"short"})}</time></p>
        {Number(row.email_review_count)>0 ? <p>Check the email provider before sending a follow-up. The in-app notification is saved.</p> : null}
        {row.invoice_id ? <Link href={`/admin/invoices/${row.invoice_id}`}>View invoice</Link> : null}
        <details><summary>Processing details</summary><p>Event: <code>{row.event_id}</code></p><p>Attempts: {row.attempts}</p>{row.last_problem ? <p>Support reference: {row.last_problem}</p> : null}</details>
      </div>
      {!row.processed_at ? <RetryWebhook eventId={row.event_id} busy={row.lease_active} /> : null}
    </li>
  ))}</ul>;
}
function receiptStatus(row: Receipt) {
  if (Number(row.email_review_count)>0) return "Payment processed; office email needs review";
  if (Number(row.email_failed_count)>0) return "Payment processed; office email not sent";
  if (row.processed_at) return "Complete";
  if (row.lease_active) return "Processing";
  return row.state === "review" ? "Review required" : "Ready to retry";
}
function eventLabel(type: string) {
  if (type.includes("dispute")) return "Payment dispute";
  if (type.includes("refunded")) return "Payment refund";
  if (type.includes("failed")) return "Payment did not complete";
  if (type.includes("expired")) return "Checkout expired";
  if (type.includes("processing")) return "Payment in progress";
  return type.startsWith("checkout.") || type.startsWith("payment_intent.") ? "Payment update" : "Other Stripe event";
}
