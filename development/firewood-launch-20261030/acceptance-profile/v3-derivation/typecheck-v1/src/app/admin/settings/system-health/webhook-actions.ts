"use server";
import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { processStripeWebhook, type WebhookEnvelope } from "@/lib/payments/webhook-recovery";
import { sendWebhookNotificationEmail } from "@/lib/payments/webhook-email";
import { createCheckoutBudget } from "@/lib/payments/checkout-budget";
import { syncInvoicePaymentCommunications } from "@/lib/communications/queue";
import { safeWebhookLog } from "@/lib/payments/webhook-logging";
import { safeStaffMessage } from "@/lib/security/errors";

export type WebhookRetryState = { status: "idle" | "error" | "success"; message: string };
export async function retryStripeWebhook(_previous: WebhookRetryState, form: FormData): Promise<WebhookRetryState> {
  const userClient = await createClient();
  if (!userClient) return { status: "error", message: "Payment recovery is not configured." };
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || !hasAllowedRole(await getUserRoles(userClient, user.id), platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only an active owner or admin can retry payment processing." };
  }
  const eventId = String(form.get("event_id") ?? "");
  if (!/^evt_[A-Za-z0-9_]{1,251}$/.test(eventId)) return { status: "error", message: "Choose a valid payment event." };
  // Recheck live authority, target state and the attempt allowance inside the DB
  // before constructing privileged clients or retrieving any provider object.
  const permission = await userClient.rpc("request_stripe_webhook_retry", { p_event_id: eventId });
  if (permission.error || !permission.data) return { status: "error", message: safeStaffMessage(permission.error?.message) };
  const context = permission.data;
  const supabase = getServiceRoleClient(), config = getStripeServerConfig(), budget = createCheckoutBudget();
  if (!supabase) return { status: "error", message: "Payment recovery is not configured." };
  let event: WebhookEnvelope;
  try {
    if (context.phase === "effects_ready" && context.object_id && context.created_at && typeof context.livemode === "boolean") {
      // Financial work is already durable. Finish downstream work without needing
      // a historical event to remain available through Stripe's event API.
      event = { id: eventId, type: context.event_type, livemode: context.livemode,
        created: Math.floor(new Date(context.created_at).getTime() / 1000), data: { object: { id: context.object_id } } };
    } else {
      if (!config.configured) return { status: "error", message: "Stripe is not configured on this machine. The event remains available for recovery." };
      event = await budget.run(() => config.stripe.events.retrieve(eventId, {}, budget.requestOptions())) as WebhookEnvelope;
      if (event.id !== eventId) throw new Error("Recovery event identity mismatch.");
    }
    const result = await processStripeWebhook(event, { supabase, stripe: config.stripe,
      livemode: config.configured ? config.livemode : event.livemode, budget,
      sendEmail: sendWebhookNotificationEmail, syncCommunications: invoiceId => syncInvoicePaymentCommunications(supabase, invoiceId) });
    revalidatePath("/admin/settings/system-health");
    if (context.invoice_id) revalidatePath(`/admin/invoices/${context.invoice_id}`);
    return result.status === "completed"
      ? { status: "success", message: "Payment processing is complete. Any uncertain office email remains flagged for review." }
      : { status: "error", message: result.status === "busy" ? "This event is already being processed. Check again shortly." : "This event still needs review. Its history has been retained." };
  } catch (error) {
    console.error("Payment recovery failed", safeWebhookLog({ error, eventType: context.event_type, internalEventCategory: "processing" }));
    revalidatePath("/admin/settings/system-health");
    return { status: "error", message: "Recovery could not finish. The event and completed steps are retained; review the status before retrying." };
  }
}
