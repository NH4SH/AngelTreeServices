"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import type {
  FirewoodOfficeActionState, FirewoodOfficeSubmitAction, FirewoodOfficeIntent,
  FirewoodOfficeWorkspaceModel, FirewoodOfficePriceReview, FirewoodOfficeAcceptedOrder,
  FirewoodOfficeContact,
} from "@/lib/firewood/office-ui-types";
import "./firewood-office-workspace.css";

const money = (cents: number | null) => Number.isSafeInteger(cents) && cents !== null && cents >= 0
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
  : "Not confirmed";
const dollars = (cents: number) => (cents / 100).toFixed(2);
const initialState: FirewoodOfficeActionState = { status: "idle", message: "" };
const orderHref = (order: { kind: string; orderId: string; invoiceId?: string }, page: number) => {
  const query = new URLSearchParams({ office_order: order.orderId, office_page: String(page) });
  if (order.kind === "accepted_order" && order.invoiceId) query.set("office_invoice", order.invoiceId);
  return `/admin/firewood/office?${query.toString()}#website-orders`;
};

/** Runtime reads and authorization belong to the server; no fixtures or provider calls live here. */
export function FirewoodOfficeWorkspace({ model, submitAction }: {
  model: FirewoodOfficeWorkspaceModel;
  submitAction?: FirewoodOfficeSubmitAction;
}) {
  if (model.status !== "ready") return <section className="firewood-office" id="website-orders" aria-labelledby="website-orders-heading">
    <header><h2 id="website-orders-heading">Website orders</h2></header>
    <p className={model.status === "error" ? "form-message error" : "inline-empty"} role={model.status === "error" ? "alert" : "status"}>{model.message}</p>
  </section>;
  return <section className="firewood-office" id="website-orders" aria-labelledby="website-orders-heading">
    <header><h2 id="website-orders-heading">Website orders</h2><p>Review agreed prices, delivery arrangements and cancellations.</p></header>
    {!model.canManage ? <p className="form-helper">An owner or administrator can approve prices and manage cancellations.</p> : null}
    <div className="firewood-office-workspace">
      <div className="firewood-office-browse">
        {model.entries.length ? <ul className="firewood-office-list" aria-label="Website order records">{model.entries.map(entry => <li key={`${entry.kind}:${entry.orderId}`}>
          <Link href={orderHref(entry, model.page)} aria-current={entry.orderId === model.selected?.orderId ? "page" : undefined}>
            <span><strong>{entry.customerName}</strong><small>{entry.reference} · {entry.description}</small><small>{entry.statusLabel}</small></span>
            {entry.principalCents === null ? null : <span className="firewood-office-row-amount">{money(entry.principalCents)}</span>}
          </Link>
        </li>)}</ul> : <p className="inline-empty">No website orders need review on this page. New office price requests and accepted orders will appear here.</p>}
        {model.page > 1 || model.hasMore ? <nav className="firewood-office-paging" aria-label="Website orders pages">
          {model.page > 1 ? <Link className="secondary-action" href={`/admin/firewood/office?office_page=${model.page - 1}#website-orders`}>Previous</Link> : null}
          <span>Page {model.page}</span>
          {model.hasMore ? <Link className="secondary-action" href={`/admin/firewood/office?office_page=${model.page + 1}#website-orders`}>Next</Link> : null}
        </nav> : null}
      </div>
      {model.selected ? <div className="firewood-office-detail" key={`${model.selected.kind}:${model.selected.orderId}:${model.selected.revision}`}>
        {model.selected.kind === "price_review"
          ? <PriceReview record={model.selected} allowed={model.canManage} submitAction={submitAction} />
          : <AcceptedOrder record={model.selected} allowed={model.canManage} submitAction={submitAction} />}
      </div> : model.entries.length ? <p className="firewood-office-select">Open an order to review its details.</p> : null}
    </div>
  </section>;
}

function Contact({ contact }: { contact: FirewoodOfficeContact }) {
  return <div className="firewood-office-contact">
    <strong>{contact.name}</strong><p>{contact.email}<br />{contact.phone}</p><p className="firewood-office-address">{contact.address}</p>
    {contact.instructions ? <details><summary>Delivery instructions</summary><p className="firewood-office-address">{contact.instructions}</p></details> : null}
  </div>;
}

function PriceReview({ record, allowed, submitAction }: { record: FirewoodOfficePriceReview; allowed: boolean; submitAction?: FirewoodOfficeSubmitAction }) {
  const [wood, setWood] = useState(dollars(record.woodCents));
  const [stacking, setStacking] = useState(dollars(record.stackingCents));
  const woodCents = parseDollars(wood), stackingCents = record.stacking ? parseDollars(stacking) : 0;
  const valid = woodCents !== null && woodCents > 0 && woodCents <= record.woodCents
    && stackingCents !== null && stackingCents >= 0 && stackingCents <= record.stackingCents;
  const total = valid ? woodCents + stackingCents : null;
  const approval = record.approval;
  return <>
    <header className="firewood-office-record-heading"><h3>Review price · {record.reference}</h3><p>{record.quantityLabel}{record.stacking ? " with stacking" : " · no stacking"}</p></header>
    <Contact contact={record.contact} />
    {approval ? <section className="firewood-office-section"><h4>{approval.status === "available" ? "Price approved" : approval.status === "accepted" ? "Approved price accepted" : approval.status === "expired" ? "Price approval expired" : "Price approval revoked"}</h4>
      {approval.woodCents !== null && approval.stackingCents !== null ? <p>{money(approval.woodCents + approval.stackingCents)} total · {approval.expiresLabel}</p>
        : <><p>Previous approved amount is not shown. Review the retained office history.</p><p className="form-helper">{approval.expiresLabel}</p></>}
      {approval.approvedByLabel ? <p className="form-helper">{approval.approvedByLabel}</p> : null}
      {approval.status === "available" ? <details><summary>Revoke this approval</summary>
        <OfficeForm intent="revoke_price" record={record} label="Revoke approval" pendingLabel="Revoking…" allowed={allowed} submitAction={submitAction}>
          <input type="hidden" name="approval_id" value={approval.id} />
          <Reason label="Why are you revoking this price?" />
          <p className="form-help">This prevents use of an unaccepted approval. It does not change an accepted order.</p>
        </OfficeForm>
      </details> : approval.status !== "accepted" ? <p className="form-help">A new price review is needed before the customer can accept a changed price.</p> : null}
    </section> : <section className="firewood-office-section"><h4>Approve this order’s price</h4>
      <p>Delivery and qualifying household sales tax are included at $0. The customer will review this price before accepting.</p>
      <OfficeForm intent="approve_price" record={record} label="Approve price" pendingLabel="Approving…" allowed={allowed} blocked={!valid} submitAction={submitAction}>
        <input name="draft_hash" type="hidden" value={record.draftHash} />
        <div className="form-grid-two">
          <label>Firewood price ($)<input name="wood_price" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required value={wood} onChange={event => setWood(event.target.value)} /></label>
          {record.stacking ? <label>Stacking, once per delivery ($)<input name="stacking_price" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required value={stacking} onChange={event => setStacking(event.target.value)} /></label>
            : <input name="stacking_price" type="hidden" value="0.00" />}
        </div>
        <div className="firewood-office-price-total"><span>Approved total</span><strong aria-live="polite" aria-atomic="true">{money(total)}</strong></div>
        {!valid ? <p className="form-message error" role="alert">Enter valid prices at or below the starting price. Firewood must be at least $0.01.</p> : null}
        <button className="secondary-action firewood-office-veterans" type="button" onClick={() => { setWood(dollars(Math.round(record.woodCents * 0.95))); setStacking(dollars(Math.round(record.stackingCents * 0.95))); }}>Apply 5% veterans price</button>
        <p className="form-help">Confirm eligibility with the customer first. The discount applies to wood and stacking before taxes and other fees. Only one discount applies.</p>
        <Reason label="Reason for this approval" />
        <label className="checkbox-field"><input name="office_price_confirmed" type="checkbox" value="confirmed" required />I confirmed residential use and that only one discount applies.</label>
      </OfficeForm>
    </section>}
  </>;
}

function AcceptedOrder({ record, allowed, submitAction }: { record: FirewoodOfficeAcceptedOrder; allowed: boolean; submitAction?: FirewoodOfficeSubmitAction }) {
  const cancelled = record.cancellation.status === "confirmed";
  return <>
    <header className="firewood-office-record-heading"><h3>{record.reference}</h3><p>{record.quantityLabel}{record.stacking ? " with stacking" : ""} · <Link href={`/admin/invoices/${encodeURIComponent(record.invoiceId)}?returnTo=%2Fadmin%2Ffirewood%2Foffice`}>{record.invoiceNumber}</Link></p></header>
    <Contact contact={record.contact} />
    <section className="firewood-office-section"><h4>Payment</h4><p>{record.paymentLabel}</p>
      <dl className="firewood-office-money"><div><dt>Order total</dt><dd>{money(record.principalCents)}</dd></div><div><dt>Principal received</dt><dd>{money(record.moneyConfirmed ? record.paidPrincipalCents : null)}</dd></div><div><dt>Card fee received</dt><dd>{money(record.moneyConfirmed ? record.surchargeCents : null)}</dd></div><div><dt>Refunded</dt><dd>{money(record.moneyConfirmed ? record.refundedCents : null)}</dd></div>
        {record.accounting?.creditId ? <div><dt>Cancellation credit</dt><dd>{money(record.moneyConfirmed ? record.accounting.creditedPrincipalCents : null)}</dd></div> : null}
        <div><dt>Amount still owed</dt><dd>{record.invoiceVoided ? "Voided — no payment due" : money(record.moneyConfirmed ? record.accounting?.collectibleBalanceCents ?? record.balanceDueCents : null)}</dd></div></dl>
      {record.accounting ? <p className="form-help">Invoice issued {record.accounting.issuedAtLabel}. Email delivery is recorded separately.</p> : null}
      {record.accounting?.creditId ? <p className="form-help">The cancelled order’s balance was released. This credit is separate from payments and refunds; the original order and money history are retained.</p> : null}
      {record.paymentWarnings.length ? <ul className="firewood-office-warnings">{record.paymentWarnings.map(message => <li key={message}>{message}</li>)}</ul> : null}
      <p className="form-help">Accepted prices stay with this order. A payment preference or bank payment in progress does not confirm payment.</p>
    </section>
    <section className="firewood-office-section"><h4>Delivery</h4>
      {record.deliveryWindow ? <><p>{record.deliveryWindow.startLabel} – {record.deliveryWindow.endLabel}</p><details><summary>Agreed delivery details</summary><p>{record.deliveryWindow.evidence}</p></details></> : <p>No delivery window recorded.</p>}
      {!cancelled && record.cancellation.status === "none" ? <details><summary>{record.deliveryWindow ? "Update agreed delivery window" : "Record an agreed delivery window"}</summary>
        <OfficeForm intent="save_delivery_window" record={record} label="Save delivery window" pendingLabel="Saving…" allowed={allowed} submitAction={submitAction}>
          <input name="ledger_hash" type="hidden" value={record.ledgerHash} />
          <div className="form-grid-two"><label>Start (Eastern time)<input name="window_start" type="datetime-local" required /></label><label>End (Eastern time)<input name="window_end" type="datetime-local" required /></label></div>
          <Reason label="How and when did the customer agree to this window?" />
          <p className="form-help">Record the customer’s agreement before using this window to review a cancellation. Saving this does not send a message.</p>
        </OfficeForm>
      </details> : null}
    </section>
    <section className="firewood-office-section"><h4>{cancelled ? "Order cancelled" : record.cancellation.status === "requested" ? "Cancellation review" : "Cancellation"}</h4>
      {record.cancellation.status !== "none" ? <>
        {record.cancellation.reasonLabel ? <p>{record.cancellation.reasonLabel}</p> : null}
        {record.cancellation.policyLabel ? <p>{record.cancellation.policyLabel}</p> : null}
        {record.cancellation.refundLabel ? <p><strong>{record.cancellation.refundLabel}</strong>{record.cancellation.refundDueCents !== undefined && record.cancellation.refundDueCents !== null ? ` · ${money(record.cancellation.refundDueCents)}` : ""}</p> : null}
        {record.cancellation.blockers.length ? <ul className="firewood-office-warnings">{record.cancellation.blockers.map(message => <li key={message}>{message}</li>)}</ul> : null}
        <p className="form-help">New collection and delivery stay on hold. Review any payment or refund separately; no money is moved here.</p>
        {record.cancellation.status === "requested" && record.cancellation.canCredit ? <details open><summary>Release cancelled invoice balance</summary>
          <OfficeForm intent="credit_cancellation" record={record} label="Release invoice balance" pendingLabel="Releasing balance…" allowed={allowed} submitAction={submitAction}>
            <input name="ledger_hash" type="hidden" value={record.ledgerHash} />
            <p>This records a cancellation credit of {money(record.accounting?.rawBalanceDueCents ?? null)} so the customer no longer owes that amount. It does not send a refund or change recorded payments.</p>
            <Reason label="Reason for releasing this invoice balance" />
            <label className="checkbox-field"><input name="confirm_credit" type="checkbox" required value="confirmed" />I reviewed the cancellation and payment history. Release this invoice balance without sending money or a message.</label>
          </OfficeForm>
        </details> : null}
        {record.cancellation.status === "requested" && !record.cancellation.canCredit && !record.accounting?.creditId && record.cancellation.creditBlockers?.length
          ? <details><summary>Balance release review</summary><ul className="firewood-office-warnings">{record.cancellation.creditBlockers.map(message => <li key={message}>{message}</li>)}</ul></details> : null}
        {record.cancellation.status === "requested" ? <OfficeForm intent="confirm_cancellation" record={record} label="Confirm cancellation" pendingLabel="Confirming…" allowed={allowed} blocked={!record.cancellation.canConfirm} submitAction={submitAction}>
          <input name="expected_cancellation_revision" type="hidden" value={record.cancellation.revision} /><input name="ledger_hash" type="hidden" value={record.ledgerHash} />
          <Reason label="Office review notes" />
          <label className="checkbox-field"><input name="confirm_cancellation" type="checkbox" required value="confirmed" />I reviewed the current payment and refund status. Cancel this order without sending a message or issuing a refund.</label>
        </OfficeForm> : null}
      </> : <details><summary>Cancel this order</summary>
        <OfficeForm intent="request_cancellation" record={record} label="Request cancellation" pendingLabel="Pausing order…" allowed={allowed} submitAction={submitAction}>
          <input name="ledger_hash" type="hidden" value={record.ledgerHash} />
          <label>Why is the order being cancelled?<select name="cancellation_reason" required defaultValue=""><option value="" disabled>Choose a reason</option><option value="customer_request">Customer cancellation</option><option value="angel_cancelled">Angel cancellation</option><option value="cannot_fulfill">Angel cannot fulfill</option><option value="declined_angel_reschedule">Customer declined an Angel-requested reschedule</option></select></label>
          <Reason label="Cancellation details" />
          <label className="checkbox-field"><input name="confirm_hold" type="checkbox" required value="confirmed" />Pause new payment and delivery while this cancellation is reviewed.</label>
          <p className="form-help">The next step shows the cancellation terms and verified payment status. Pending payments remain under review. Nothing is refunded automatically.</p>
        </OfficeForm>
      </details>}
    </section>
    {record.history?.length ? <details className="firewood-office-section"><summary>Office history</summary><ol className="firewood-office-history">{record.history.map(item => <li key={item.id}><p>{item.description}</p><small>{item.atLabel} · {item.actorLabel}</small></li>)}</ol><p className="form-help">Recent office actions are shown here. Full invoice and delivery history is retained.</p></details> : null}
  </>;
}

function OfficeForm({ intent, record, children, label, pendingLabel, allowed, blocked = false, submitAction }: {
  intent: FirewoodOfficeIntent; record: { orderId: string; invoiceId?: string; revision: number };
  children: ReactNode; label: string; pendingLabel: string; allowed: boolean; blocked?: boolean; submitAction?: FirewoodOfficeSubmitAction;
}) {
  const router = useRouter(), requestId = useRef<string | null>(null), feedback = useRef<HTMLParagraphElement>(null);
  const [state, action, pending] = useReliableActionState(async (previous: FirewoodOfficeActionState, form: FormData) => {
    if (!allowed || blocked || !submitAction) return { status: "error" as const, message: "Office actions are unavailable. Refresh this order before trying again." };
    requestId.current ??= crypto.randomUUID(); form.set("request_id", requestId.current);
    const result = await submitAction(previous, form);
    if (result.status === "success") router.refresh();
    return result;
  }, initialState);
  useEffect(() => { if (state.status === "error" && state.message) feedback.current?.focus(); }, [state]);
  const disabled = pending || state.status === "success" || !allowed || !submitAction;
  const feedbackId = `firewood-office-${intent}-${record.orderId}-feedback`;
  return <form action={action} className="crm-form firewood-office-form" aria-busy={pending} aria-describedby={state.message ? feedbackId : undefined}
    onSubmit={event => {
      // React form actions defer transition updates. Dispatch from the submit
      // event so the reliable hook's busy state is visible before the request.
      event.preventDefault();
      void action(new FormData(event.currentTarget));
    }}
    onReset={event => event.preventDefault()}>
    <input type="hidden" name="intent" value={intent} /><input type="hidden" name="order_id" value={record.orderId} /><input type="hidden" name="expected_revision" value={record.revision} />
    {record.invoiceId ? <input type="hidden" name="invoice_id" value={record.invoiceId} /> : null}
    <fieldset disabled={disabled}><legend className="firewood-office-form-legend">{label}</legend>{children}</fieldset>
    <div className="record-form-actions"><button disabled={disabled || blocked} type="submit">{pending ? pendingLabel : label}</button></div>
    {state.message ? <p className={`form-message ${state.status}`} id={feedbackId} ref={feedback} tabIndex={-1} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}

function Reason({ label }: { label: string }) {
  return <label>{label}<textarea name="reason" maxLength={500} required rows={3} /></label>;
}

function parseDollars(value: string): number | null {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
