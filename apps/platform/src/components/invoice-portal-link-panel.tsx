"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, RotateCw, ShieldCheck, XCircle } from "lucide-react";
import { createInvoicePortalLink, regenerateInvoicePortalLink, revokeInvoicePortalLink, type InvoicePortalTokenActionState } from "@/lib/actions/invoice-portal-tokens";
import type { InvoicePortalTokenSummary } from "@/lib/data/portal-invoice";
import { formatBusinessDateTime } from "@/lib/business-time";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { forgetInvoiceLinkAttempt, invoiceLinkIntents, prepareInvoiceLinkAttempt, readInvoiceLinkAttempt, type InvoiceLinkAttempt, type InvoiceLinkIntent } from "@/lib/portal/invoice-link-attempt";

const initialState: InvoicePortalTokenActionState = { ok: false, status: "idle", message: "" };
function storage() { try { return window.sessionStorage; } catch { return null; } }
export function InvoicePortalLinkPanel({ invoiceId, linkVersion, tokens }: { invoiceId: string; linkVersion: string | null; tokens: InvoicePortalTokenSummary[] }) {
  const router = useRouter(), attemptRef = useRef<InvoiceLinkAttempt | undefined>(undefined);
  const [attempt, setAttempt] = useState<InvoiceLinkAttempt | undefined>(undefined), [restored, setRestored] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  useEffect(() => { const saved = readInvoiceLinkAttempt(invoiceId, storage()); attemptRef.current = saved; setAttempt(saved); setRestored(true); }, [invoiceId]);
  const [state, action, pending] = useReliableActionState(async (previous: InvoicePortalTokenActionState, form: FormData): Promise<InvoicePortalTokenActionState> => {
    if (previous.reviewRequired || previous.saveDestination && previous.savedLinkVersion !== linkVersion) return previous;
    const intent = String(form.get("link_intent")) as InvoiceLinkIntent, tokenId = String(form.get("token_id") ?? "") || null;
    if (!invoiceLinkIntents.includes(intent)) return { ok: false, status: "error", message: "Reload before choosing a link action.", reviewRequired: true };
    const earlier = attemptRef.current ?? readInvoiceLinkAttempt(invoiceId, storage());
    if (!earlier && intent !== "generate" && !window.confirm(intent === "regenerate" ? "Regenerate this invoice link? Previous customer links will stop working. No email is sent automatically." : "Revoke this invoice link? The customer will no longer be able to open this exact secure link.")) return previous;
    if (!earlier && !linkVersion) return { ok: false, status: "error", message: "Reload the invoice to load its current links.", reviewRequired: true };
    const prepared = prepareInvoiceLinkAttempt(invoiceId, linkVersion ?? "", intent, tokenId, storage(), earlier);
    attemptRef.current = prepared.attempt; setAttempt(prepared.attempt);
    if (prepared.blocked) return { ok: false, status: "error", message: "Check the earlier link action before choosing another." };
    const saved = prepared.attempt;
    form.set("request_id", saved.requestId); form.set("expected_version", saved.version); form.set("token_id", saved.tokenId ?? "");
    const run = saved.intent === "generate" ? createInvoicePortalLink : saved.intent === "regenerate" ? regenerateInvoicePortalLink : revokeInvoicePortalLink;
    const result = await run(previous, form);
    if (result.status === "success" || result.saveRejected) { forgetInvoiceLinkAttempt(invoiceId, storage()); attemptRef.current = undefined; setAttempt(undefined); }
    return result;
  }, initialState);
  useEffect(() => { if (state.saveDestination) { router.push(state.saveDestination); router.refresh(); } }, [state.saveDestination, router]);
  const busy = !restored || pending || Boolean(attempt) || state.reviewRequired || Boolean(state.saveDestination && state.savedLinkVersion !== linkVersion);
  const active = tokens.find(token => getTokenState(token) === "Active"), shareable = !busy && active?.usable && active.portalUrl ? active : null;
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (event.currentTarget.reportValidity()) void action(new FormData(event.currentTarget)); };
  const actionForm = (intent: InvoiceLinkIntent, label: string, tokenId: string | null = null, history = false) => <form action={action} onSubmit={submit}>
    <input name="invoice_id" type="hidden" value={invoiceId} /><input name="link_intent" type="hidden" value={intent} /><input name="token_id" type="hidden" value={tokenId ?? ""} />
    <button className={history ? "portal-text-button" : intent === "generate" ? "portal-primary-button" : "portal-secondary-button"} disabled={busy || !linkVersion} type="submit">
      {intent === "generate" ? <Link2 aria-hidden="true" size={18} /> : intent === "regenerate" ? <RotateCw aria-hidden="true" size={18} /> : <XCircle aria-hidden="true" size={17} />}{pending ? "Checking link..." : label}
    </button></form>;
  async function copyPortalLink() {
    if (!shareable?.portalUrl) return;
    try { await navigator.clipboard.writeText(shareable.portalUrl); setCopyFeedback("Invoice link copied."); }
    catch { setCopyFeedback("Copy failed. Select the link manually."); }
  }
  return <section className="portal-link-panel invoice-portal-link-panel print-hidden">
    <div><p className="surface-label"><ShieldCheck aria-hidden="true" size={18} />Secure customer link</p><h2>Share this invoice</h2>
      <p>Share this secure link with the customer so they can view and print the invoice. Editing this invoice will update the customer's existing link. It will not revoke the link.</p></div>
    <div className="portal-link-actions">{!active ? actionForm("generate", "Generate customer link") : actionForm("regenerate", "Regenerate link")}</div>
    {attempt ? <form action={action} onSubmit={submit}><input name="invoice_id" type="hidden" value={invoiceId} /><input name="link_intent" type="hidden" value={attempt.intent} /><input name="token_id" type="hidden" value={attempt.tokenId ?? ""} /><button className="portal-secondary-button" disabled={pending} type="submit">{pending ? "Checking link..." : "Check earlier link action"}</button></form> : null}
    {active && (!active.usable || !active.portalUrl) ? <p className="portal-link-note"><ShieldCheck aria-hidden="true" size={17} />This link cannot be recovered for the current customer. Regenerate only if you intend to replace it.</p> : null}
    {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {state.reviewRequired ? <Link className="text-link" href={`/admin/invoices/${invoiceId}`}>Reload current invoice links</Link> : null}
    {active?.portalUrl && active.usable ? <div className="generated-portal-link">
      <label>Customer invoice link<input readOnly disabled={!shareable} value={shareable?.portalUrl ?? "Confirm the earlier link action before sharing."} /></label>
      <div className="invoice-link-actions"><button className="portal-secondary-button" disabled={!shareable} onClick={copyPortalLink} type="button"><Copy aria-hidden="true" size={17} />Copy customer link</button>
        {shareable?.portalUrl ? <Link className="portal-secondary-button" href={shareable.portalUrl} rel="noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={17} />Open customer view</Link> : null}</div>
      <p>{active.expires_at ? `Expires ${formatDate(active.expires_at)}.` : "No expiration is set for this existing link."}</p>{copyFeedback && shareable ? <p className="email-copy-feedback" role="status">{copyFeedback}</p> : null}</div> : null}
    <details className="invoice-link-history"><summary>Link history ({tokens.length})</summary><div className="portal-token-list">
      {tokens.length ? tokens.map(token => <article className="portal-token-row" key={token.id}><div><strong>Link ending in {token.token_hint ?? "hidden"}</strong><span>{getTokenState(token)}{token.expires_at ? ` · Expires ${formatDate(token.expires_at)}` : ""}</span></div>
        {!token.revoked_at ? actionForm("revoke", "Revoke", token.id, true) : null}</article>) : <p className="inline-empty">No customer invoice links generated yet.</p>}
    </div></details>
  </section>;
}
function getTokenState(token: InvoicePortalTokenSummary) { return token.revoked_at ? "Revoked" : token.expires_at && new Date(token.expires_at).getTime() <= Date.now() ? "Expired" : "Active"; }
function formatDate(value: string) { return formatBusinessDateTime(value, { dateStyle: "medium" }); }
