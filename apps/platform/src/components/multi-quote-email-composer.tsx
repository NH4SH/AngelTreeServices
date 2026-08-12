"use client";

import { AlertTriangle, Mail, Monitor, RefreshCw, RotateCcw, Send, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  regenerateLegacyQuotePortalLinksForEmail,
  type MultiQuotePortalRecoveryState,
} from "@/lib/actions/portal-tokens";
import { sendMultiQuoteEmail, type TransactionalEmailActionState } from "@/lib/actions/transactional-email";
import {
  applyMultiQuoteEmailEdits,
  applyMultiQuotePortalUrls,
  type MultiQuoteEmailDraft,
  type MultiQuoteEmailEdits,
} from "@/lib/quotes/multi-email";

const initialState: TransactionalEmailActionState = { status: "idle", message: "" };
const initialRecoveryState: MultiQuotePortalRecoveryState = {
  message: "",
  ok: false,
  portalUrls: {},
  status: "idle",
};

export function MultiQuoteEmailComposer({
  attemptId,
  draft,
  legacyQuoteIds,
  partyName,
  quoteIds,
  recipient,
}: {
  attemptId: string;
  draft: MultiQuoteEmailDraft;
  legacyQuoteIds: string[];
  partyName: string;
  quoteIds: string[];
  recipient: string;
}) {
  const [state, formAction, pending] = useReliableActionState(sendMultiQuoteEmail, initialState);
  const [recoveryState, recoveryAction, recoveryPending] = useReliableActionState(
    regenerateLegacyQuotePortalLinksForEmail,
    initialRecoveryState,
  );
  const initialEdits = useMemo(() => draftEdits(draft), [draft]);
  const [edits, setEdits] = useState<MultiQuoteEmailEdits>(initialEdits);
  const [replacementUrls, setReplacementUrls] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop");
  const previewDraft = applyMultiQuotePortalUrls(draft, replacementUrls);
  const preview = applyMultiQuoteEmailEdits(previewDraft, edits);
  const sent = state.status === "success";
  const unresolvedLegacyQuoteIds = legacyQuoteIds.filter((quoteId) => !replacementUrls[quoteId]);
  const replacementRequired = unresolvedLegacyQuoteIds.length > 0;
  const sendBlocked = pending || sent || recoveryPending || replacementRequired;

  useEffect(() => {
    if (Object.keys(recoveryState.portalUrls).length === 0) return;
    setReplacementUrls((current) => ({ ...current, ...recoveryState.portalUrls }));
  }, [recoveryState.portalUrls]);

  function update<K extends keyof MultiQuoteEmailEdits>(key: K, value: MultiQuoteEmailEdits[K]) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  function replaceLegacyLinks() {
    const proposalLabel = unresolvedLegacyQuoteIds.length === 1 ? "proposal" : "proposals";
    if (!window.confirm(`Replace the older customer ${proposalLabel === "proposal" ? "link" : "links"}? Previously sent URLs for the affected ${proposalLabel} will stop working.`)) {
      return;
    }

    const formData = new FormData();
    unresolvedLegacyQuoteIds.forEach((quoteId) => formData.append("quote_id", quoteId));
    void recoveryAction(formData);
  }

  return (
    <section className="customer-email-composer multi-quote-email-composer">
      <header>
        <div>
          <p className="surface-label"><Mail aria-hidden="true" size={17} />Combined proposal email</p>
          <h3>Review before sending</h3>
          <p>Each proposal keeps its own price, secure link, and approval decision.</p>
        </div>
        <button className="primary-action" disabled={sendBlocked} form="multi-quote-email-form" type="submit">
          <Send aria-hidden="true" size={17} />
          {pending ? "Sending..." : sent ? "Email sent" : `Send ${quoteIds.length} proposals`}
        </button>
      </header>

      {replacementRequired ? (
        <section className="email-portal-recovery-notice" role="alert">
          <AlertTriangle aria-hidden="true" size={21} />
          <div>
            <strong>{unresolvedLegacyQuoteIds.length} older customer {unresolvedLegacyQuoteIds.length === 1 ? "link needs" : "links need"} replacement</strong>
            <p>The affected proposals predate secure link recovery. Replacing their links will disable those previous customer URLs and keep this combined email workflow open.</p>
            {recoveryState.message ? <p className={`form-message ${recoveryState.status}`}>{recoveryState.message}</p> : null}
          </div>
          <button className="secondary-action" disabled={recoveryPending} onClick={replaceLegacyLinks} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            {recoveryPending ? "Regenerating..." : "Regenerate links and continue"}
          </button>
        </section>
      ) : recoveryState.message ? (
        <p className={`form-message ${recoveryState.status}`} role={recoveryState.status === "error" ? "alert" : "status"}>{recoveryState.message}</p>
      ) : null}

      <form
        className="customer-email-composer-form"
        id="multi-quote-email-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (sendBlocked) return;
          void formAction(new FormData(event.currentTarget));
        }}
      >
        {quoteIds.map((quoteId) => <input key={quoteId} name="quote_id" type="hidden" value={quoteId} />)}
        <input name="email_attempt_id" type="hidden" value={`multi-quote-${attemptId}`} />
        <div className="email-authoritative-summary multi-quote-authoritative-summary" aria-label="CRM controlled email details">
          <div><span>Customer</span><strong>{partyName}</strong></div>
          <div><span>To</span><strong>{recipient}</strong></div>
          <div><span>Proposals</span><strong>{quoteIds.length} independent quotes</strong></div>
          <div><span>Secure links</span><strong>{replacementRequired ? "Replacement required" : "Ready for delivery"}</strong></div>
        </div>
        {state.message ? <div className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</div> : null}

        <div className="email-composer-fields">
          <ComposerField label="Subject" maxLength={180} name="email_subject" onChange={(value) => update("subject", value)} value={edits.subject} />
          <ComposerField label="Greeting" maxLength={160} name="email_greeting" onChange={(value) => update("greeting", value)} value={edits.greeting} />
          <ComposerField label="Introduction" maxLength={1_200} multiline name="email_intro" onChange={(value) => update("intro", value)} value={edits.intro} />
          <ComposerField label="Closing" maxLength={1_200} multiline name="email_closing" onChange={(value) => update("closing", value)} value={edits.closing} />
          <button className="secondary-action" disabled={pending || sent || recoveryPending} onClick={() => setEdits(initialEdits)} type="button">
            <RotateCcw aria-hidden="true" size={16} />Reset message
          </button>
          <p className="form-helper">Quote totals, recipient, customer, and secure destinations are always reloaded from the CRM when you send.</p>
        </div>

        <section className="email-composer-preview-panel" aria-label="Combined proposal email preview">
          <div className="email-preview-toolbar">
            <strong>Preview</strong>
            <div className="email-preview-controls">
              <div className="segmented-control" role="group" aria-label="Email preview format">
                <button aria-pressed={previewMode === "html"} onClick={() => setPreviewMode("html")} type="button">Email</button>
                <button aria-pressed={previewMode === "text"} onClick={() => setPreviewMode("text")} type="button">Plain text</button>
              </div>
              {previewMode === "html" ? <div className="segmented-control" role="group" aria-label="Email preview size">
                <button aria-pressed={viewportMode === "desktop"} onClick={() => setViewportMode("desktop")} type="button"><Monitor aria-hidden="true" size={16} />Desktop</button>
                <button aria-pressed={viewportMode === "mobile"} onClick={() => setViewportMode("mobile")} type="button"><Smartphone aria-hidden="true" size={16} />Mobile</button>
              </div> : null}
            </div>
          </div>
          {previewMode === "text"
            ? <pre className="email-plain-text-preview">{preview.body}</pre>
            : <div className={`email-preview-canvas ${viewportMode}`}><MultiQuotePreview draft={preview} /></div>}
        </section>

        <footer>
          <button className="primary-action" disabled={sendBlocked} type="submit">
            <Send aria-hidden="true" size={17} />
            {pending ? "Sending..." : sent ? "Email sent" : `Send ${quoteIds.length} proposals`}
          </button>
        </footer>
      </form>
    </section>
  );
}

function ComposerField({ label, maxLength, multiline = false, name, onChange, value }: {
  label: string;
  maxLength: number;
  multiline?: boolean;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return <label className="email-composer-field"><span className="email-composer-field-heading"><strong>{label}</strong></span>{multiline
    ? <textarea maxLength={maxLength} name={name} onChange={(event) => onChange(event.target.value)} required rows={4} value={value} />
    : <input maxLength={maxLength} name={name} onChange={(event) => onChange(event.target.value)} required value={value} />}</label>;
}

function MultiQuotePreview({ draft }: { draft: MultiQuoteEmailDraft }) {
  return <article className="branded-email-preview multi-quote-preview">
    <header><img alt="Angel Tree Services" src="/angel-tree-services-logo.jpg" /></header>
    <div className="branded-email-preview-body">
      <p>{draft.greeting}</p>
      <p className="email-preview-prewrap">{draft.intro}</p>
      {draft.items.map((item, index) => <section className="multi-quote-preview-item" key={item.quoteId}>
        <span>Proposal {index + 1}</span>
        <h4>{item.title}</h4>
        <p>{item.quoteLabel} · {item.propertyLabel}</p>
        <p className="email-preview-prewrap">{item.scopeSummary}</p>
        <dl><div><dt>Proposal total</dt><dd>{item.totalLabel}</dd></div></dl>
        <small>{item.validityLabel}</small>
        <span className="email-preview-cta">Review proposal</span>
        <small>{item.portalUrl ? <span>{item.portalUrl}</span> : "Secure link created when sent"}</small>
      </section>)}
      <p className="email-preview-prewrap">{draft.closing}</p>
      <p>Thank you,<br /><br /><strong>Angel Tree Services</strong></p>
    </div>
    <footer>(540) 388-8715<br />info@angeltreeservice.org<br />angeltreeservices.org</footer>
  </article>;
}

function draftEdits(draft: MultiQuoteEmailDraft): MultiQuoteEmailEdits {
  return { subject: draft.subject, greeting: draft.greeting, intro: draft.intro, closing: draft.closing };
}
