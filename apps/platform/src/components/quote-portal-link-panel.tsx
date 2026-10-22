"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, RotateCw, ShieldCheck, XCircle } from "lucide-react";
import { createQuotePortalLink, regenerateQuotePortalLink, revokeQuotePortalLink, type PortalTokenActionState } from "@/lib/actions/portal-tokens";
import type { QuotePortalTokenSummary } from "@/lib/data/portal-quote";
import { formatBusinessDateTime } from "@/lib/business-time";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { forgetQuoteLinkAttempt, quoteLinkIntents, prepareQuoteLinkAttempt, readQuoteLinkAttempt, type QuoteLinkAttempt, type QuoteLinkIntent } from "@/lib/portal/quote-link-attempt";

const initialState: PortalTokenActionState = { ok: false, status: "idle", message: "" };
function storage() { try { return window.sessionStorage; } catch { return null; } }
export function QuotePortalLinkPanel({ quoteId, linkVersion, tokens }: { quoteId: string; linkVersion: string | null; tokens: QuotePortalTokenSummary[] }) {
  const router = useRouter(), attemptRef = useRef<QuoteLinkAttempt | undefined>(undefined);
  const [attempt, setAttempt] = useState<QuoteLinkAttempt | undefined>(undefined), [restored, setRestored] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  useEffect(() => { const saved = readQuoteLinkAttempt(quoteId, storage()); attemptRef.current = saved; setAttempt(saved); setRestored(true); }, [quoteId]);
  const [state, action, pending] = useReliableActionState(async (previous: PortalTokenActionState, form: FormData): Promise<PortalTokenActionState> => {
    if (previous.reviewRequired || previous.saveDestination && previous.savedLinkVersion !== linkVersion) return previous;
    const intent = String(form.get("link_intent")) as QuoteLinkIntent, tokenId = String(form.get("token_id") ?? "") || null;
    if (!quoteLinkIntents.includes(intent)) return { ok: false, status: "error", message: "Reload before choosing a link action.", reviewRequired: true };
    const earlier = attemptRef.current ?? readQuoteLinkAttempt(quoteId, storage());
    if (!earlier && intent !== "generate" && !window.confirm(intent === "regenerate" ? "Regenerate this quote link? Previous customer links will stop working. No email is sent automatically." : "Revoke this quote link? The customer will no longer be able to open this exact secure link.")) return previous;
    if (!earlier && !linkVersion) return { ok: false, status: "error", message: "Reload the quote to load its current links.", reviewRequired: true };
    const prepared = prepareQuoteLinkAttempt(quoteId, linkVersion ?? "", intent, tokenId, storage(), earlier);
    attemptRef.current = prepared.attempt; setAttempt(prepared.attempt);
    if (prepared.blocked) return { ok: false, status: "error", message: "Check the earlier link action before choosing another." };
    const saved = prepared.attempt;
    form.set("request_id", saved.requestId); form.set("expected_version", saved.version); form.set("token_id", saved.tokenId ?? "");
    const run = saved.intent === "generate" ? createQuotePortalLink : saved.intent === "regenerate" ? regenerateQuotePortalLink : revokeQuotePortalLink;
    const result = await run(previous, form);
    if (result.status === "success" || result.saveRejected) { forgetQuoteLinkAttempt(quoteId, storage()); attemptRef.current = undefined; setAttempt(undefined); }
    return result;
  }, initialState);
  useEffect(() => { if (state.saveDestination) { router.push(state.saveDestination); router.refresh(); } }, [state.saveDestination, router]);
  const busy = !restored || pending || Boolean(attempt) || state.reviewRequired || Boolean(state.saveDestination && state.savedLinkVersion !== linkVersion);
  const active = tokens.find(token => ["Active", "Opened or used"].includes(getTokenState(token))), shareable = !busy && active?.usable && active.portalUrl ? active : null;
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (event.currentTarget.reportValidity()) void action(new FormData(event.currentTarget)); };
  const actionForm = (intent: QuoteLinkIntent, label: string, tokenId: string | null = null, history = false) => <form action={action} onSubmit={submit}>
    <input name="quote_id" type="hidden" value={quoteId} /><input name="link_intent" type="hidden" value={intent} /><input name="token_id" type="hidden" value={tokenId ?? ""} />
    <button className={history ? "portal-text-button" : intent === "generate" ? "portal-primary-button" : "portal-secondary-button"} disabled={busy || !linkVersion} type="submit">
      {intent === "generate" ? <Link2 aria-hidden="true" size={18} /> : intent === "regenerate" ? <RotateCw aria-hidden="true" size={18} /> : <XCircle aria-hidden="true" size={17} />}{pending ? "Checking link..." : label}
    </button></form>;
  async function copyPortalLink() {
    if (!shareable?.portalUrl) return;
    try { await navigator.clipboard.writeText(shareable.portalUrl); setCopyFeedback("Quote link copied."); }
    catch { setCopyFeedback("Copy failed. Select the link manually."); }
  }
  return <section className="portal-link-panel print-hidden">
    <div><p className="surface-label"><ShieldCheck aria-hidden="true" size={18} />Secure customer link</p><h2>Share only this quote</h2>
      <p>Share this secure link with the customer so they can review it, approve it, or request changes. Editing this quote will update the customer's existing link. It will not revoke the link.</p></div>
    <div className={`portal-link-status ${getTokenStatus(tokens).variant}`}><strong>{getTokenStatus(tokens).title}</strong><span>{getTokenStatus(tokens).body}</span></div>
    <div className="portal-link-actions">{!active ? actionForm("generate", "Generate customer link") : actionForm("regenerate", "Regenerate link")}</div>
    {attempt ? <form action={action} onSubmit={submit}><input name="quote_id" type="hidden" value={quoteId} /><input name="link_intent" type="hidden" value={attempt.intent} /><input name="token_id" type="hidden" value={attempt.tokenId ?? ""} /><button className="portal-secondary-button" disabled={pending} type="submit">{pending ? "Checking link..." : "Check earlier link action"}</button></form> : null}
    {active && (!active.usable || !active.portalUrl) ? <p className="portal-link-note"><ShieldCheck aria-hidden="true" size={17} />This link cannot be recovered for the current customer. Regenerate only if you intend to replace it.</p> : null}
    {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {state.reviewRequired ? <a className="text-link" href={`/admin/quotes/${quoteId}`}>Reload current quote links</a> : null}
    {active?.portalUrl && active.usable ? <div className="generated-portal-link">
      <label>Customer quote link<input readOnly disabled={!shareable} value={shareable?.portalUrl ?? "Confirm the earlier link action before sharing."} /></label>
      <div className="quote-link-actions"><button className="portal-secondary-button" disabled={!shareable} onClick={copyPortalLink} type="button"><Copy aria-hidden="true" size={17} />Copy customer link</button>
        {shareable?.portalUrl ? <Link className="portal-secondary-button" href={shareable.portalUrl} rel="noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={17} />Open customer view</Link> : null}</div>
      <p>{active.expires_at ? `Expires ${formatDate(active.expires_at)}.` : "No expiration is set for this existing link."}</p>{copyFeedback && shareable ? <p className="email-copy-feedback" role="status">{copyFeedback}</p> : null}</div> : null}
    <div aria-label="Customer link history"><div className="portal-token-list">
      {tokens.length ? tokens.map(token => <article className="portal-token-row" key={token.id}><div><strong>Link ending in {token.token_hint ?? "hidden"}</strong><span>{getTokenState(token)}{token.expires_at ? ` · Expires ${formatDate(token.expires_at)}` : ""}</span></div>
        {!token.revoked_at ? actionForm("revoke", "Revoke", token.id, true) : null}</article>) : <p className="inline-empty">No customer quote links generated yet.</p>}
    </div></div>
  </section>;
}
function getTokenState(token: QuotePortalTokenSummary) {
  if (token.revoked_at) {
    return "Revoked";
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return "Expired";
  }

  if (token.used_at) {
    return "Opened or used";
  }

  return "Active";
}

function getTokenStatus(tokens: QuotePortalTokenSummary[]) {
  if (tokens.some((token) => getTokenState(token) === "Active" || getTokenState(token) === "Opened or used")) {
    return {
      title: tokens.some(token => token.usable) ? "Active link exists" : "Link needs review",
      body: tokens.some(token => token.usable) ? "The customer’s current secure link shows saved quote edits." : "Review this link before sharing it with the current customer.",
      variant: "active",
    };
  }

  if (tokens.some((token) => getTokenState(token) === "Expired")) {
    return {
      title: "Previous link expired",
      body: "Generate a new link when the customer needs access again.",
      variant: "expired",
    };
  }

  if (tokens.some((token) => getTokenState(token) === "Revoked")) {
    return {
      title: "Previous link revoked",
      body: "The old customer link is closed. Generate a new link only when you are ready to share it.",
      variant: "revoked",
    };
  }

  return {
    title: "No link generated",
    body: "Generate a secure link when this quote is ready for the customer.",
    variant: "empty",
  };
}

function formatDate(value: string) {
  return formatBusinessDateTime(value, { dateStyle: "medium" });
}
