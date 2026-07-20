"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react";
import {
  approveQuoteByPortalToken,
  requestQuoteChangesByPortalToken,
  type PortalTokenActionState,
} from "@/lib/actions/portal-tokens";

const initialState: PortalTokenActionState = {
  ok: false,
  status: "idle",
  message: "",
};

export function PortalQuoteActions({ rawToken }: { rawToken: string }) {
  const [approvalState, approvalAction, approvalPending] = useReliableActionState(approveQuoteByPortalToken, initialState);
  const [changeState, changeAction, changePending] = useReliableActionState(requestQuoteChangesByPortalToken, initialState);

  if (approvalState.status === "success") {
    return <PortalConfirmation message={approvalState.message} title="Quote approved" variant="approved" />;
  }

  if (changeState.status === "success") {
    return <PortalConfirmation message={changeState.message} title="Change request sent" variant="change_requested" />;
  }

  return (
    <section className="customer-quote-actions" aria-label="Quote response actions">
      <div className="customer-quote-actions-intro">
        <p className="surface-label">
          <CheckCircle2 aria-hidden="true" size={18} />
          Your Decision
        </p>
        <h2>Ready to move forward?</h2>
        <p>Approve the quote below, or send a short note if you would like us to adjust the scope.</p>
      </div>

      <div className="customer-quote-action-stack">
        <form action={approvalAction}>
          <input name="token" type="hidden" value={rawToken} />
          <button className="customer-approve-button" disabled={approvalPending || changePending} type="submit">
            <CheckCircle2 aria-hidden="true" size={20} />
            {approvalPending ? "Approving..." : "Approve Quote"}
          </button>
        </form>

        <p className="customer-quote-action-note">
          <ShieldCheck aria-hidden="true" size={16} />
          Approval keeps this quote tied to this secure link only.
        </p>
      </div>

      <form action={changeAction} className="customer-change-form">
        <input name="token" type="hidden" value={rawToken} />
        <div className="customer-change-form-copy">
          <h3>Need an adjustment first?</h3>
          <p>Send a short note and the Angel Tree team can review the scope with you.</p>
        </div>
        <label>
          Request changes
          <textarea
            maxLength={1000}
            minLength={3}
            name="message"
            placeholder="Tell us what you would like to adjust."
            required
            rows={4}
          />
        </label>
        <button className="customer-secondary-button" disabled={approvalPending || changePending} type="submit">
          <MessageSquareText aria-hidden="true" size={18} />
          {changePending ? "Sending..." : "Send change request"}
        </button>
      </form>

      {approvalState.message ? <ActionMessage state={approvalState} /> : null}
      {changeState.message ? <ActionMessage state={changeState} /> : null}
    </section>
  );
}

function PortalConfirmation({
  message,
  title,
  variant,
}: {
  message: string;
  title: string;
  variant: "approved" | "change_requested";
}) {
  return (
    <section className={`customer-quote-confirmation ${variant}`} role="status">
      <CheckCircle2 aria-hidden="true" size={24} />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function ActionMessage({ state }: { state: PortalTokenActionState }) {
  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}
