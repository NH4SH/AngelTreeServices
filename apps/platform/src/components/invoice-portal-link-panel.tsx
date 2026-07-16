"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
  const [regenerateState, regenerateAction, regeneratePending] = useActionState(regenerateInvoicePortalLink, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeInvoicePortalLink, initialState);
  const [copyFeedback, setCopyFeedback] = useState("");
  const activeToken = tokens.find((token) => getTokenState(token) === "Active");
  const latestLinkState = regenerateState.portalUrl ? regenerateState : createState;

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
          <form action={createAction}>
            <input name="invoice_id" type="hidden" value={invoiceId} />
            <button className="portal-primary-button" disabled={createPending} type="submit">
              <Link2 aria-hidden="true" size={18} />
              {createPending ? "Generating..." : "Generate invoice link"}
            </button>
          </form>
        ) : null}
        {activeToken ? (
          <form
            action={regenerateAction}
            onSubmit={(event) => {
              if (!window.confirm("Regenerating this link will disable the previous customer link.")) {
                event.preventDefault();
              }
            }}
          >
            <input name="invoice_id" type="hidden" value={invoiceId} />
            <button className="portal-secondary-button" disabled={regeneratePending} type="submit">
              <RotateCw aria-hidden="true" size={18} />
              {regeneratePending ? "Regenerating..." : "Regenerate link"}
            </button>
          </form>
        ) : null}
      </div>

      {activeToken && !latestLinkState.portalUrl ? (
        <p className="portal-link-note">
          <ShieldCheck aria-hidden="true" size={17} />
          An active link exists and will show saved invoice edits. The active raw URL cannot be shown again because only its secure hash is stored.
        </p>
      ) : null}

      {createState.message ? (
        <p className={`form-message ${createState.status}`} role={createState.status === "error" ? "alert" : "status"}>
          {createState.message}
        </p>
      ) : null}
      {regenerateState.message ? (
        <p className={`form-message ${regenerateState.status}`} role={regenerateState.status === "error" ? "alert" : "status"}>
          {regenerateState.message}
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
              Copy invoice link
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
                    action={revokeAction}
                    onSubmit={(event) => {
                      if (!window.confirm("Revoke this invoice link? The customer will no longer be able to open this exact secure link.")) {
                        event.preventDefault();
                      }
                    }}
                  >
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
