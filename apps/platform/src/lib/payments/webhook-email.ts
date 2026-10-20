import "server-only";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import type { WebhookEmail } from "./webhook-recovery";

// Uses the existing provider and notification email type. The receipt protocol
// reserves this specific notification once before invoking the sender.
export async function sendWebhookNotificationEmail(input: WebhookEmail) {
  const destination = input.destination === null ? null : buildCanonicalAppUrl(input.destination);
  return sendTransactionalEmail({
    to: input.to, subject: input.title,
    text: [input.body, destination ? `Open in admin: ${destination}` : ""].filter(Boolean).join("\n\n"),
    emailType: "admin_customer_activity", relatedInvoiceId: input.invoice_id,
    idempotencyKey: `admin-activity:${input.notificationId}`, signal: input.signal,
  });
}
