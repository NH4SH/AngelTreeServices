"use client";

import { useActionState, useState } from "react";
import { Clipboard, Copy, Link2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { EmailDraftCard } from "@/components/email-draft-card";
import { SendQuoteEmailForm } from "@/components/send-email-action-form";
import {
  createQuotePortalLink,
  regenerateQuotePortalLink,
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
  const [regenerateState, regenerateAction, regeneratePending] = useActionState(regenerateQuotePortalLink, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeQuotePortalLink, initialState);
  const [copyFeedback, setCopyFeedback] = useState("");
  const activeTokens = tokens.filter((token) => getTokenState(token) === "Active" || getTokenState(token) === "Opened or used");
  const tokenStatus = getTokenStatus(tokens);
  const latestLinkState = regenerateState.portalUrl ? regenerateState : createState;

  async function copyPortalLink() {
    if (!latestLinkState.portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestLinkState.portalUrl);
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
          Generate a private link for the customer to review this quote, approve it, or request changes.
          Editing this quote will update the customer's existing link. It will not revoke the link.
        </p>
      </div>

      <div className={`portal-link-status ${tokenStatus.variant}`}>
        <strong>{tokenStatus.title}</strong>
        <span>{tokenStatus.body}</span>
      </div>

      <div className="portal-link-actions">
        {activeTokens.length === 0 ? (
          <form action={createAction}>
            <input name="quote_id" type="hidden" value={quoteId} />
            <button className="portal-primary-button" disabled={createPending} type="submit">
              <Link2 aria-hidden="true" size={18} />
              {createPending ? "Generating..." : "Generate secure quote link"}
            </button>
          </form>
        ) : (
          <p className="portal-link-note compact">
            <Clipboard aria-hidden="true" size={17} />
            The active raw URL cannot be shown again because only its secure hash is stored.
          </p>
        )}
        {activeTokens.length > 0 ? (
          <form
            action={regenerateAction}
            onSubmit={(event) => {
              if (!window.confirm("Regenerating this link will disable the previous customer link.")) {
                event.preventDefault();
              }
            }}
          >
            <input name="quote_id" type="hidden" value={quoteId} />
            <button className="portal-secondary-button" disabled={regeneratePending} type="submit">
              <RefreshCw aria-hidden="true" size={18} />
              {regeneratePending ? "Regenerating..." : "Regenerate link"}
            </button>
          </form>
        ) : null}
      </div>

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
            Copy this link now
            <input readOnly value={latestLinkState.portalUrl} />
          </label>
            <button className="portal-secondary-button" onClick={copyPortalLink} type="button">
              <Copy aria-hidden="true" size={17} />
              Copy link
            </button>
            <SendQuoteEmailForm portalUrl={latestLinkState.portalUrl} quoteId={quoteId} />
          <p>
            Expires {latestLinkState.expiresAt ? formatDate(latestLinkState.expiresAt) : "after the configured window"}.
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
                <form
                  action={revokeAction}
                  onSubmit={(event) => {
                    if (!window.confirm("Revoke this quote link? The customer will no longer be able to open this exact secure link.")) {
                      event.preventDefault();
                    }
                  }}
                >
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

      {latestLinkState.portalUrl ? (
        <EmailDraftCard
          draft={generateQuoteEmailDraft(quoteDraftInput, { portalUrl: latestLinkState.portalUrl })}
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

function getTokenStatus(tokens: QuotePortalTokenSummary[]) {
  if (tokens.some((token) => getTokenState(token) === "Active" || getTokenState(token) === "Opened or used")) {
    return {
      title: "Active link exists",
      body: "The customer's current secure link will keep working and will show saved quote edits.",
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
