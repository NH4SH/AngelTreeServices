"use client";

import { useActionState } from "react";
import { CheckCircle2, MessageSquareText, XCircle } from "lucide-react";
import { approveChangeOrderByPortal, respondToChangeOrderByPortal } from "@/lib/actions/change-orders";
import { initialChangeOrderActionState } from "@/lib/action-states/change-orders";

export function PortalChangeOrderActions({ token }: { token: string }) {
  const [approvalState, approvalAction, approvalPending] = useActionState(approveChangeOrderByPortal, initialChangeOrderActionState);
  const [responseState, responseAction, responsePending] = useActionState(respondToChangeOrderByPortal, initialChangeOrderActionState);
  if (approvalState.status === "success" || responseState.status === "success") return <section className="customer-quote-confirmation" role="status"><CheckCircle2 size={24} /><div><h2>Response received</h2><p>{approvalState.message || responseState.message}</p></div></section>;
  return (
    <section className="customer-quote-actions">
      <div className="customer-quote-actions-intro"><p className="surface-label"><CheckCircle2 size={18} /> Your decision</p><h2>Authorize this additional work?</h2><p>Approval adds only this change-order scope to the work order. The original quote remains unchanged.</p></div>
      <form action={approvalAction} className="crm-form"><input name="token" type="hidden" value={token} /><label>Name of person authorizing<input maxLength={160} name="approver_name" required /></label><button className="customer-approve-button" disabled={approvalPending || responsePending} type="submit"><CheckCircle2 size={20} />{approvalPending ? "Approving..." : "Approve additional work"}</button>{approvalState.message ? <p className="form-message error">{approvalState.message}</p> : null}</form>
      <form action={responseAction} className="customer-change-form"><input name="token" type="hidden" value={token} /><label>Message<textarea maxLength={1000} name="message" placeholder="Tell us what should change, or why you are declining." rows={4} /></label><div className="customer-response-buttons"><button className="customer-secondary-button" disabled={approvalPending || responsePending} name="response_intent" type="submit" value="request_changes"><MessageSquareText size={18} /> Request changes</button><button className="customer-decline-button" disabled={approvalPending || responsePending} name="response_intent" type="submit" value="decline"><XCircle size={18} /> Decline</button></div>{responseState.message ? <p className={`form-message ${responseState.status}`}>{responseState.message}</p> : null}</form>
    </section>
  );
}
