"use client";

import { useActionState, useState } from "react";
import { Clipboard, Copy, Link2, ShieldCheck, XCircle } from "lucide-react";
import { EmailDraftCard } from "@/components/email-draft-card";
import {
  createQuotePortalLink,
  revokeQuotePortalLink,
  type PortalTokenActionState,
} from "@/lib/actions/portal-tokens";
import { generateQuoteEmailDraft, type QuoteEmailDraftInput } from "@/lib/documents/email-drafts";
import type { QuotePortalTokenSummary } from "@/lib/data/portal-quote";

const initialState: PortalTokenActionState = {
  status: "idle",
  message: "",
};

export function QuotePortalLinkPanel({
  quoteDraftInput,
  quoteId,
  tokens,
}: {
  quoteDraftInput: QuoteEmailDraftInput;
  quoteId: string;
  tokens: QuotePortalTokenSummary[];
}) {
  const [createState, createAction, createPending] = useActionState(createQuotePortalLink, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeQuotePortalLink, initialState);
  const [copyFeedback, setCopyFeedback] = useState("");

  async function copyPortalLink() {
    if (!createState.portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createState.portalUrl);
      setCopyFeedback("Secure link copied.");
    } catch {
      setCopyFeedback("Copy failed. Select the link manually.");
    }
  }

  return (
    <section className="portal-link-panel print-hidden">
      <div>
        <p className="surface-label">
          <ShieldCheck aria-hidden="true" size={18} />
          Customer Portal Link
        </p>
        <h2>Share only this quote</h2>
        <p>
          Generate a private link for the customer to review this quote, approve it, or request changes. The raw
          token is shown once and is not stored.
        </p>
      </div>

      <form action={createAction}>
        <input name="quote_id" type="hidden" value={quoteId} />
        <button className="portal-primary-button" disabled={createPending} type="submit">
          <Link2 aria-hidden="true" size={18} />
          {createPending ? "Generating..." : "Generate secure quote link"}
        </button>
      </form>

      {createState.message ? (
        <p className={`form-message ${createState.status}`} role={createState.status === "error" ? "alert" : "status"}>
          {createState.message}
        </p>
      ) : null}

      {createState.portalUrl ? (
        <div className="generated-portal-link">
          <label>
            Copy this link now
            <input readOnly value={createState.portalUrl} />
          </label>
          <button className="portal-secondary-button" onClick={copyPortalLink} type="button">
            <Copy aria-hidden="true" size={17} />
            Copy link
          </button>
          <p>
            Expires {createState.expiresAt ? formatDate(createState.expiresAt) : "after the configured window"}.
          </p>
          {copyFeedback ? <p className="email-copy-feedback" role="status">{copyFeedback}</p> : null}
        </div>
      ) : null}

      <div className="portal-token-list">
        <h3>Generated links</h3>
        {tokens.length ? (
          tokens.map((token) => (
            <article className="portal-token-row" key={token.id}>
              <div>
                <strong>Link ending in {token.token_hint ?? "hidden"}</strong>
                <span>{getTokenState(token)} · {token.expires_at ? `Expires ${formatDate(token.expires_at)}` : "No expiration set"}</span>
              </div>
              {!token.revoked_at ? (
                <form action={revokeAction}>
                  <input name="quote_id" type="hidden" value={quoteId} />
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
          <p className="inline-empty">No customer portal links generated yet.</p>
        )}
        {revokeState.message ? (
          <p className={`form-message ${revokeState.status}`} role={revokeState.status === "error" ? "alert" : "status"}>
            {revokeState.message}
          </p>
        ) : null}
      </div>

      {createState.portalUrl ? (
        <EmailDraftCard
          draft={generateQuoteEmailDraft(quoteDraftInput, { portalUrl: createState.portalUrl })}
          embedded
          label="Quote email draft with secure link"
        />
      ) : (
        <p className="portal-link-note">
          <Clipboard aria-hidden="true" size={17} />
          Generate a link to prepare a copyable quote email draft with the secure URL included.
        </p>
      )}
    </section>
  );
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
