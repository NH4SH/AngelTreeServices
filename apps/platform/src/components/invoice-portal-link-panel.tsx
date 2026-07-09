"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Copy, ExternalLink, Link2, RotateCw, ShieldCheck, XCircle } from "lucide-react";
import { EmailDraftCard } from "@/components/email-draft-card";
import {
  createInvoicePortalLink,
  revokeInvoicePortalLink,
  type InvoicePortalTokenActionState,
} from "@/lib/actions/invoice-portal-tokens";
import {
  generateInvoiceEmailDraft,
  type InvoiceEmailDraftInput,
} from "@/lib/documents/email-drafts";
import type { InvoicePortalTokenSummary } from "@/lib/data/portal-invoice";

const initialState: InvoicePortalTokenActionState = {
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
  const [createState, createAction, createPending] = useActionState(createInvoicePortalLink, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeInvoicePortalLink, initialState);
  const [copyFeedback, setCopyFeedback] = useState("");
  const activeToken = tokens.find((token) => getTokenState(token) === "Active");

  async function copyPortalLink() {
    if (!createState.portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createState.portalUrl);
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
        <p>Share this secure link with the customer so they can view and print the invoice.</p>
      </div>

      <form action={createAction}>
        <input name="invoice_id" type="hidden" value={invoiceId} />
        <button className="portal-primary-button" disabled={createPending} type="submit">
          {activeToken ? <RotateCw aria-hidden="true" size={18} /> : <Link2 aria-hidden="true" size={18} />}
          {createPending
            ? "Generating..."
            : activeToken
              ? "Generate replacement link"
              : "Generate invoice link"}
        </button>
      </form>

      {activeToken && !createState.portalUrl ? (
        <p className="portal-link-note">
          <ShieldCheck aria-hidden="true" size={17} />
          An active link exists. Generate a replacement to copy it again; raw links are never stored.
        </p>
      ) : null}

      {createState.message ? (
        <p className={`form-message ${createState.status}`} role={createState.status === "error" ? "alert" : "status"}>
          {createState.message}
        </p>
      ) : null}

      {createState.portalUrl ? (
        <div className="generated-portal-link">
          <label>
            Customer invoice link
            <input readOnly value={createState.portalUrl} />
          </label>
          <div className="invoice-link-actions">
            <button className="portal-secondary-button" onClick={copyPortalLink} type="button">
              <Copy aria-hidden="true" size={17} />
              Copy invoice link
            </button>
            <Link
              className="portal-secondary-button"
              href={createState.portalUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" size={17} />
              Open customer view
            </Link>
          </div>
          <p>Expires {createState.expiresAt ? formatDate(createState.expiresAt) : "after the configured window"}.</p>
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
                  <form action={revokeAction}>
                    <input name="invoice_id" type="hidden" value={invoiceId} />
                    <input name="token_id" type="hidden" value={token.id} />
                    <button className="portal-text-button" disabled={revokePending} type="submit">
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
          {revokeState.message ? (
            <p className={`form-message ${revokeState.status}`} role={revokeState.status === "error" ? "alert" : "status"}>
              {revokeState.message}
            </p>
          ) : null}
        </div>
      </details>

      {createState.portalUrl ? (
        <EmailDraftCard
          draft={generateInvoiceEmailDraft(invoice, { portalUrl: createState.portalUrl })}
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
