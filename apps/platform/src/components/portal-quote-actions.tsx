"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react";
import {
  approveQuoteByPortalToken,
  requestQuoteChangesByPortalToken,
  type PortalTokenActionState,
} from "@/lib/actions/portal-tokens";
import type { PortalWorkSummary } from "@/lib/portal/quote-presentation";

const initialState: PortalTokenActionState = {
  ok: false,
  status: "idle",
  message: "",
};

export function PortalQuoteActions({
  approved,
  expirationLabel,
  rawToken,
  statusLabel,
  totalLabel,
  workSummary,
}: {
  approved: boolean;
  expirationLabel: string;
  rawToken: string;
  statusLabel: string;
  totalLabel: string;
  workSummary: PortalWorkSummary | null;
}) {
  const [approvalState, approvalAction, approvalPending] = useReliableActionState(approveQuoteByPortalToken, initialState);
  const [changeState, changeAction, changePending] = useReliableActionState(requestQuoteChangesByPortalToken, initialState);

  if (approvalState.status === "success") {
    return (
      <DecisionPanelFrame
        expirationLabel={expirationLabel}
        statusLabel="Approved"
        totalLabel={totalLabel}
        workSummary={workSummary}
      >
        <PortalConfirmation message={approvalState.message} title="Proposal approved" variant="approved" />
      </DecisionPanelFrame>
    );
  }

  if (changeState.status === "success") {
    return (
      <DecisionPanelFrame
        expirationLabel={expirationLabel}
        statusLabel="Changes requested"
        totalLabel={totalLabel}
        workSummary={workSummary}
      >
        <PortalConfirmation message={changeState.message} title="Change request sent" variant="change_requested" />
      </DecisionPanelFrame>
    );
  }

  return (
    <section className="customer-quote-actions" aria-label="Quote response actions">
      <DecisionPanelHeader
        expirationLabel={expirationLabel}
        statusLabel={statusLabel}
        totalLabel={totalLabel}
        workSummary={workSummary}
      />

      {approved ? (
        <PortalConfirmation
          message="Thank you. Angel Tree Services will contact you to confirm scheduling and any final details."
          title="Proposal approved"
          variant="approved"
        />
      ) : (
        <>
          <div className="customer-quote-actions-intro">
            <p className="surface-label">
              <CheckCircle2 aria-hidden="true" size={18} />
              Your decision
            </p>
            <h2>Ready to move forward?</h2>
            <p>Approve this proposal, or send a note if something needs to change.</p>
          </div>

          <div className="customer-quote-action-stack">
            <form action={approvalAction}>
              <input name="token" type="hidden" value={rawToken} />
              <button className="customer-approve-button" disabled={approvalPending || changePending} type="submit">
                <CheckCircle2 aria-hidden="true" size={20} />
                {approvalPending ? "Approving..." : "Approve proposal"}
              </button>
            </form>

            <p className="customer-quote-action-note">
              <ShieldCheck aria-hidden="true" size={16} />
              This private link is tied only to your proposal.
            </p>
          </div>

          <form action={changeAction} className="customer-change-form">
            <input name="token" type="hidden" value={rawToken} />
            <div className="customer-change-form-copy">
              <h3>Need an adjustment?</h3>
              <p>Tell the Angel Tree team what you would like changed.</p>
            </div>
            <label>
              Your request
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
              {changePending ? "Sending..." : "Request a change"}
            </button>
          </form>

          <p className="customer-quote-next-step">
            After approval, Angel Tree Services will contact you to confirm scheduling and any final details.
          </p>

          {approvalState.message ? <ActionMessage state={approvalState} /> : null}
          {changeState.message ? <ActionMessage state={changeState} /> : null}
        </>
      )}
    </section>
  );
}

function DecisionPanelFrame({
  children,
  expirationLabel,
  statusLabel,
  totalLabel,
  workSummary,
}: {
  children: React.ReactNode;
  expirationLabel: string;
  statusLabel: string;
  totalLabel: string;
  workSummary: PortalWorkSummary | null;
}) {
  return (
    <section className="customer-quote-actions" aria-label="Quote response">
      <DecisionPanelHeader
        expirationLabel={expirationLabel}
        statusLabel={statusLabel}
        totalLabel={totalLabel}
        workSummary={workSummary}
      />
      {children}
    </section>
  );
}

function DecisionPanelHeader({
  expirationLabel,
  statusLabel,
  totalLabel,
  workSummary,
}: {
  expirationLabel: string;
  statusLabel: string;
  totalLabel: string;
  workSummary: PortalWorkSummary | null;
}) {
  return (
    <>
      <dl className="customer-quote-decision-facts">
        <div>
          <dt>Total</dt>
          <dd>{totalLabel}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Valid through</dt>
          <dd>{expirationLabel}</dd>
        </div>
      </dl>
      {workSummary ? (
        <section className="customer-quote-work-summary" aria-labelledby="work-summary-title">
          <h2 id="work-summary-title">Work summary</h2>
          {workSummary.mode === "short" ? (
            <ul>
              {workSummary.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p>{workSummary.message}</p>
          )}
          <a href="#proposal-scope">View full scope below</a>
        </section>
      ) : null}
    </>
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
