"use client";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { retryStripeWebhook, type WebhookRetryState } from "./webhook-actions";
const initial: WebhookRetryState = { status:"idle", message:"" };
export function RetryWebhook({ eventId, busy }: { eventId: string; busy: boolean }) {
  const [state, action, pending] = useReliableActionState(retryStripeWebhook, initial);
  return (
    <form action={action} aria-busy={pending} onSubmit={event => {
      if (!window.confirm("Retry this saved payment event? Completed work will be preserved. This will not charge the customer or resend an uncertain email.")) event.preventDefault();
    }}>
      <input type="hidden" name="event_id" value={eventId} />
      <button aria-label={`Retry processing for payment event ${eventId}`} className="secondary-action" disabled={busy || pending} type="submit">{pending ? "Retrying…" : busy ? "Processing…" : "Retry processing"}</button>
      {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
