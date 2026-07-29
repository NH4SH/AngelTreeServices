"use client";

import { FileText, Mail, RotateCcw, Send, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  sendInvoiceEmail,
  sendQuoteEmail,
  type TransactionalEmailActionState,
} from "@/lib/actions/transactional-email";
import {
  buildCustomerDocumentEmailText,
  type CustomerDocumentEmailDraft,
  type CustomerDocumentEmailEdits,
} from "@/lib/documents/email-drafts";

const initialState: TransactionalEmailActionState = {
  status: "idle",
  message: "",
};

type ComposerProps = {
  disabled?: boolean;
  documentHref: string;
  draft: CustomerDocumentEmailDraft;
  portalUrl?: string;
  recipient: string;
};

export function SendQuoteEmailForm({
  disabled = false,
  documentHref,
  draft,
  portalUrl,
  quoteId,
  recipient,
}: ComposerProps & { quoteId: string }) {
  const [state, formAction, pending] = useReliableActionState(sendQuoteEmail, initialState);
  return (
    <CustomerDocumentEmailComposer
      disabled={disabled}
      documentHref={documentHref}
      draft={draft}
      formAction={formAction}
      hiddenField={<input name="quote_id" type="hidden" value={quoteId} />}
      pending={pending}
      portalUrl={portalUrl}
      recipient={recipient}
      state={state}
    />
  );
}

export function SendInvoiceEmailForm({
  disabled = false,
  documentHref,
  draft,
  invoiceId,
  portalUrl,
  recipient,
}: ComposerProps & { invoiceId: string }) {
  const [state, formAction, pending] = useReliableActionState(sendInvoiceEmail, initialState);
  return (
    <CustomerDocumentEmailComposer
      disabled={disabled}
      documentHref={documentHref}
      draft={draft}
      formAction={formAction}
      hiddenField={<input name="invoice_id" type="hidden" value={invoiceId} />}
      pending={pending}
      portalUrl={portalUrl}
      recipient={recipient}
      state={state}
    />
  );
}

function CustomerDocumentEmailComposer({
  disabled,
  documentHref,
  draft,
  formAction,
  hiddenField,
  pending,
  portalUrl,
  recipient,
  state,
}: ComposerProps & {
  formAction: (payload: FormData) => Promise<void>;
  hiddenField: ReactNode;
  pending: boolean;
  state: TransactionalEmailActionState;
}) {
  const initialEdits = useMemo(() => draftEdits(draft), [draft]);
  const [edits, setEdits] = useState<CustomerDocumentEmailEdits>(initialEdits);
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const previewDraft = { ...draft, ...edits, portalUrl: portalUrl ?? draft.portalUrl };
  const plainText = buildCustomerDocumentEmailText(previewDraft);

  function update<K extends keyof CustomerDocumentEmailEdits>(key: K, value: CustomerDocumentEmailEdits[K]) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEdits(initialEdits);
  }

  if (!open) {
    return (
      <div className="email-composer-launch">
        <button disabled={disabled} onClick={() => setOpen(true)} type="button">
          <Mail aria-hidden="true" size={18} />
          Review and send email
        </button>
        {disabled ? <p>Email sending is unavailable until the recipient, record status, and email configuration are ready.</p> : null}
      </div>
    );
  }

  return (
    <section className="customer-email-composer">
      <header>
        <div>
          <p className="surface-label"><Mail aria-hidden="true" size={17} />Customer email</p>
          <h3>Review before sending</h3>
          <p>Financial details and the secure customer destination stay synced to the CRM record.</p>
        </div>
        <button aria-label="Close email composer" className="icon-button" disabled={pending} onClick={() => setOpen(false)} type="button">
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      <form
        className="customer-email-composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void formAction(new FormData(event.currentTarget));
        }}
      >
        {hiddenField}
        {portalUrl ? <input name="portal_url" type="hidden" value={portalUrl} /> : null}
        <div className="email-composer-fields">
          <label>Recipient<input readOnly value={recipient} /></label>
          <label>Subject<input maxLength={180} name="email_subject" onChange={(event) => update("subject", event.target.value)} required value={edits.subject} /></label>
          <label>Greeting<input maxLength={160} name="email_greeting" onChange={(event) => update("greeting", event.target.value)} required value={edits.greeting} /></label>
          <label>Introduction<textarea maxLength={1_200} name="email_intro" onChange={(event) => update("intro", event.target.value)} required rows={3} value={edits.intro} /></label>
          <label>Scope presentation<textarea maxLength={12_000} name="email_scope" onChange={(event) => update("scopeText", event.target.value)} required rows={10} value={edits.scopeText} /></label>
          <label>Customer-facing notes<textarea maxLength={6_000} name="email_customer_notes" onChange={(event) => update("customerNotes", event.target.value)} placeholder="Optional notes, exclusions, prerequisites, or billing clarification" rows={5} value={edits.customerNotes} /></label>
          <label>Closing<textarea maxLength={1_200} name="email_closing" onChange={(event) => update("closing", event.target.value)} required rows={3} value={edits.closing} /></label>
          <div className="email-authoritative-facts" aria-label="CRM controlled email details">
            <div><span>{draft.summaryLabel}</span><strong>{draft.summaryValue}</strong></div>
            <div><span>{draft.timingLabel}</span><strong>{draft.timingValue}</strong></div>
            <div><span>Customer link</span><strong>{portalUrl ? "Active secure link" : "Created securely when sent"}</strong></div>
          </div>
          <a className="email-document-link" href={documentHref} rel="noreferrer" target="_blank">
            <FileText aria-hidden="true" size={18} />
            Open printable {draft.documentType === "quote" ? "proposal" : "invoice"}
          </a>
          <p className="form-helper">The secure customer page includes the current document and print/save-PDF option. No private internal notes are included.</p>
        </div>

        <section className="email-composer-preview-panel" aria-label="Email preview">
          <div className="email-preview-toolbar">
            <strong>Preview</strong>
            <div className="segmented-control" role="group" aria-label="Email preview format">
              <button aria-pressed={previewMode === "html"} onClick={() => setPreviewMode("html")} type="button">Email</button>
              <button aria-pressed={previewMode === "text"} onClick={() => setPreviewMode("text")} type="button">Plain text</button>
            </div>
          </div>
          {previewMode === "html" ? <BrandedEmailPreview draft={previewDraft} /> : <pre className="email-plain-text-preview">{plainText}</pre>}
        </section>

        <FormMessage state={state} />
        <footer>
          <button className="secondary-action" disabled={pending} onClick={() => setOpen(false)} type="button">Cancel</button>
          <button className="secondary-action" disabled={pending} onClick={reset} type="button">
            <RotateCcw aria-hidden="true" size={17} />
            Reset draft
          </button>
          <button className="primary-action" disabled={disabled || pending} type="submit">
            <Send aria-hidden="true" size={17} />
            {pending ? "Sending..." : draft.documentType === "quote" ? "Send proposal" : "Send invoice"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function BrandedEmailPreview({ draft }: { draft: CustomerDocumentEmailDraft }) {
  return (
    <article className="branded-email-preview">
      <header><img alt="Angel Tree Services" src="/angel-tree-services-logo.jpg" /></header>
      <div className="branded-email-preview-body">
        <p>{draft.greeting}</p>
        <p className="email-preview-prewrap">{draft.intro}</p>
        <section>
          <strong>{draft.scopeHeading}</strong>
          <pre>{draft.scopeText}</pre>
        </section>
        <dl>
          <div><dt>{draft.summaryLabel}</dt><dd>{draft.summaryValue}</dd></div>
          <div><dt>{draft.timingLabel}</dt><dd>{draft.timingValue}</dd></div>
        </dl>
        {draft.customerNotes ? <section className="email-preview-notes"><strong>Important notes</strong><pre>{draft.customerNotes}</pre></section> : null}
        <span className="email-preview-cta">{draft.ctaLabel}</span>
        <small>{draft.portalUrl || "A secure customer link will be generated when this email is sent."}</small>
        <p className="email-preview-prewrap">{draft.closing}</p>
        <p>Thank you,<br /><strong>Angel Tree Services</strong></p>
      </div>
      <footer>Angel Tree Services<br />(540) 388-8715<br />info@angeltreeservice.org<br />angeltreeservices.org</footer>
    </article>
  );
}

function draftEdits(draft: CustomerDocumentEmailDraft): CustomerDocumentEmailEdits {
  return {
    subject: draft.subject,
    greeting: draft.greeting,
    intro: draft.intro,
    scopeText: draft.scopeText,
    customerNotes: draft.customerNotes,
    closing: draft.closing,
  };
}

function FormMessage({ state }: { state: TransactionalEmailActionState }) {
  if (!state.message) return null;
  return (
    <p className={state.status === "error" ? "form-message error" : "form-message success"} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}
