"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink, Link2, RotateCw, ShieldCheck, XCircle } from "lucide-react";
import { EmailDraftCard } from "@/components/email-draft-card";
import { SendInvoiceEmailForm } from "@/components/send-email-action-form";
import {
  createInvoicePortalLink,
  regenerateInvoicePortalLink,
  revokeInvoicePortalLink,
  type InvoicePortalTokenActionState,
} from "@/lib/actions/invoice-portal-tokens";
import {
  generateInvoiceEmailDraft,
  type InvoiceEmailDraftInput,
} from "@/lib/documents/email-drafts";
import type { InvoicePortalTokenSummary } from "@/lib/data/portal-invoice";
import { usePortalLinkAction } from "@/components/use-portal-link-action";

const initialState: InvoicePortalTokenActionState = {
  ok: false,
  status: "idle",
  message: "",
};

export function InvoicePortalLinkPanel({
  invoice,
  invoiceId,
  tokens,
}: {
  invoice: InvoiceEmailDraftInput;
  invoiceId: string;
  tokens: InvoicePortalTokenSummary[];
}) {
  const create = usePortalLinkAction(createInvoicePortalLink, initialState);
  const regenerate = usePortalLinkAction(regenerateInvoicePortalLink, initialState);
  const revoke = usePortalLinkAction(revokeInvoicePortalLink, initialState);
  const [copyFeedback, setCopyFeedback] = useState("");
  const activeToken = tokens.find((token) => getTokenState(token) === "Active");
  const activeRecoverableToken = activeToken?.portalUrl ? activeToken : null;
  const latestLinkState = regenerate.state.portalUrl
    ? regenerate.state
    : create.state.portalUrl
      ? create.state
      : { portalUrl: activeRecoverableToken?.portalUrl, expiresAt: activeRecoverableToken?.expires_at };
  const isPending = create.pending || regenerate.pending || revoke.pending;

  async function copyPortalLink() {
    if (!latestLinkState.portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestLinkState.portalUrl);
      setCopyFeedback("Invoice link copied.");
    } catch {
      setCopyFeedback("Copy failed. Select the link manually.");
    }
  }

  return (
    <section className="portal-link-panel invoice-portal-link-panel print-hidden">
      <div>
        <p className="surface-label">
          <ShieldCheck aria-hidden="true" size={18} />
          Secure customer link
        </p>
        <h2>Share this invoice</h2>
        <p>
          Share this secure link with the customer so they can view and print the invoice.
          Editing this invoice will update the customer's existing link. It will not revoke the link.
        </p>
      </div>

      <div className="portal-link-actions">
        {!activeToken ? (
          <form onSubmit={(event) => {
            event.preventDefault();
            void create.submit(new FormData(event.currentTarget));
          }}>
            <input name="invoice_id" type="hidden" value={invoiceId} />
            <button className="portal-primary-button" disabled={isPending} type="submit">
              <Link2 aria-hidden="true" size={18} />
              {create.pending ? "Generating..." : "Generate customer link"}
            </button>
          </form>
        ) : null}
        {activeToken ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!window.confirm("Regenerating this link will disable the previous customer link.")) {
                return;
              }
              void regenerate.submit(new FormData(event.currentTarget));
            }}
          >
            <input name="invoice_id" type="hidden" value={invoiceId} />
            <button className="portal-secondary-button" disabled={isPending} type="submit">
              <RotateCw aria-hidden="true" size={18} />
              {regenerate.pending ? "Regenerating..." : "Regenerate link"}
            </button>
          </form>
        ) : null}
      </div>

      {activeToken && !latestLinkState.portalUrl ? (
        <p className="portal-link-note">
          <ShieldCheck aria-hidden="true" size={17} />
          This active link predates secure recovery. It remains valid, but cannot be copied here. Regenerate only if you intend to replace it.
        </p>
      ) : null}

      {create.state.message ? (
        <p className={`form-message ${create.state.status}`} role={create.state.status === "error" ? "alert" : "status"}>
          {create.state.message}
        </p>
      ) : null}
      {regenerate.state.message ? (
        <p className={`form-message ${regenerate.state.status}`} role={regenerate.state.status === "error" ? "alert" : "status"}>
          {regenerate.state.message}
        </p>
      ) : null}

      {latestLinkState.portalUrl ? (
        <div className="generated-portal-link">
          <label>
            Customer invoice link
            <input readOnly value={latestLinkState.portalUrl} />
          </label>
          <div className="invoice-link-actions">
            <button className="portal-secondary-button" onClick={copyPortalLink} type="button">
              <Copy aria-hidden="true" size={17} />
              Copy customer link
            </button>
            <Link
              className="portal-secondary-button"
              href={latestLinkState.portalUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" size={17} />
              Open customer view
            </Link>
            <SendInvoiceEmailForm invoiceId={invoiceId} portalUrl={latestLinkState.portalUrl} />
          </div>
          <p>Expires {latestLinkState.expiresAt ? formatDate(latestLinkState.expiresAt) : "after the configured window"}.</p>
          {copyFeedback ? <p className="email-copy-feedback" role="status">{copyFeedback}</p> : null}
        </div>
      ) : null}

      <details className="invoice-link-history">
        <summary>Link history ({tokens.length})</summary>
        <div className="portal-token-list">
          {tokens.length ? (
            tokens.map((token) => (
              <article className="portal-token-row" key={token.id}>
                <div>
                  <strong>Link ending in {token.token_hint ?? "hidden"}</strong>
                  <span>
                    {getTokenState(token)}
                    {token.viewed_at ? ` · Viewed ${formatDate(token.viewed_at)}` : ""}
                    {token.expires_at ? ` · Expires ${formatDate(token.expires_at)}` : ""}
                  </span>
                </div>
                {!token.revoked_at ? (
                  <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!window.confirm("Revoke this invoice link? The customer will no longer be able to open this exact secure link.")) {
                      return;
                    }
                    void revoke.submit(new FormData(event.currentTarget));
                    }}
                  >
                    <input name="invoice_id" type="hidden" value={invoiceId} />
                    <input name="token_id" type="hidden" value={token.id} />
                    <button className="portal-text-button" disabled={isPending} type="submit">
                      <XCircle aria-hidden="true" size={17} />
                      Revoke
                    </button>
                  </form>
                ) : null}
              </article>
            ))
          ) : (
            <p className="inline-empty">No customer invoice links generated yet.</p>
          )}
          {revoke.state.message ? (
            <p className={`form-message ${revoke.state.status}`} role={revoke.state.status === "error" ? "alert" : "status"}>
              {revoke.state.message}
            </p>
          ) : null}
        </div>
      </details>

      {latestLinkState.portalUrl ? (
        <EmailDraftCard
          draft={generateInvoiceEmailDraft(invoice, { portalUrl: latestLinkState.portalUrl })}
          embedded
          label="Invoice email draft with secure link"
        />
      ) : null}
    </section>
  );
}

function getTokenState(token: InvoicePortalTokenSummary) {
  if (token.revoked_at) {
    return "Revoked";
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return "Expired";
  }

  return "Active";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
