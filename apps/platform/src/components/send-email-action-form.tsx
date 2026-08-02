"use client";

import { Expand, FileText, Mail, Maximize2, Monitor, RotateCcw, Send, Smartphone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  sendInvoiceEmail,
  sendQuoteEmail,
  type TransactionalEmailActionState,
} from "@/lib/actions/transactional-email";
import {
  buildCustomerDocumentEmailText,
  parseScopePresentation,
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
  const router = useRouter();
  const initialEdits = useMemo(() => draftEdits(draft), [draft]);
  const [edits, setEdits] = useState<CustomerDocumentEmailEdits>(initialEdits);
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop");
  const [refreshing, startRefresh] = useTransition();
  const fullPreviewRef = useRef<HTMLDialogElement>(null);
  const regenerationRequestedRef = useRef(false);
  const formId = useId();
  const previewDraft = { ...draft, ...edits, portalUrl: portalUrl ?? draft.portalUrl };
  const plainText = buildCustomerDocumentEmailText(previewDraft);

  useEffect(() => {
    if (refreshing || !regenerationRequestedRef.current) return;
    setEdits(initialEdits);
    regenerationRequestedRef.current = false;
  }, [initialEdits, refreshing]);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  function update<K extends keyof CustomerDocumentEmailEdits>(key: K, value: CustomerDocumentEmailEdits[K]) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEdits(initialEdits);
  }

  function resetField(key: keyof CustomerDocumentEmailEdits) {
    update(key, initialEdits[key]);
  }

  function regenerate() {
    if (!window.confirm("Regenerate this email from the current proposal? This will replace unsaved email edits. It will not send the email or change the customer link.")) {
      return;
    }
    regenerationRequestedRef.current = true;
    reset();
    startRefresh(() => router.refresh());
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
        <div className="email-composer-header-actions">
          <button className="primary-action" disabled={disabled || pending} form={formId} type="submit">
            <Send aria-hidden="true" size={17} />
            {pending ? "Sending..." : draft.documentType === "quote" ? "Send proposal" : "Send invoice"}
          </button>
          {draft.documentType === "quote" ? (
            <button className="secondary-action" disabled={pending || refreshing} onClick={regenerate} type="button">
              <RotateCcw aria-hidden="true" size={16} />
              {refreshing ? "Refreshing..." : "Regenerate from current proposal"}
            </button>
          ) : null}
          <button aria-label="Close email composer" className="icon-button" disabled={pending} onClick={() => setOpen(false)} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <form
        className="customer-email-composer-form"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void formAction(new FormData(event.currentTarget));
        }}
      >
        {hiddenField}
        {portalUrl ? <input name="portal_url" type="hidden" value={portalUrl} /> : null}
        <div className="email-authoritative-summary" aria-label="CRM controlled email details">
          <div><span>To</span><strong>{recipient}</strong></div>
          <div><span>{draft.summaryLabel}</span><strong>{draft.summaryValue}</strong></div>
          <div><span>{draft.timingLabel}</span><strong>{draft.timingValue}</strong></div>
          <div><span>PDF attachment</span><strong>Available through the secure page</strong></div>
          <div><span>Secure link</span><strong>{portalUrl ? "Active" : "Created securely when sent"}</strong></div>
        </div>
        <FormMessage state={state} />
        <div className="email-composer-fields">
          <ComposerTextField label="Subject" maxLength={180} name="email_subject" onChange={(event) => update("subject", event.target.value)} onReset={() => resetField("subject")} required value={edits.subject} />
          <ComposerTextField label="Greeting" maxLength={160} name="email_greeting" onChange={(event) => update("greeting", event.target.value)} onReset={() => resetField("greeting")} required value={edits.greeting} />
          <ComposerTextarea label="Introduction" maxLength={1_200} name="email_intro" onChange={(event) => update("intro", event.target.value)} onReset={() => resetField("intro")} required rows={3} value={edits.intro} />
          <ComposerTextarea expandable label="Scope presentation" maxLength={12_000} name="email_scope" onChange={(event) => update("scopeText", event.target.value)} onReset={() => resetField("scopeText")} required rows={7} value={edits.scopeText} />
          <ComposerTextarea expandable label="Customer-facing notes" maxLength={6_000} name="email_customer_notes" onChange={(event) => update("customerNotes", event.target.value)} onReset={() => resetField("customerNotes")} placeholder="Optional notes, exclusions, prerequisites, or proposal terms" rows={3} value={edits.customerNotes} />
          <ComposerTextarea label="Closing" maxLength={1_200} name="email_closing" onChange={(event) => update("closing", event.target.value)} onReset={() => resetField("closing")} required rows={3} value={edits.closing} />
          <a className="email-document-link" href={documentHref} rel="noreferrer" target="_blank">
            <FileText aria-hidden="true" size={18} />
            Open printable {draft.documentType === "quote" ? "proposal" : "invoice"}
          </a>
          <p className="form-helper">The secure customer page includes the current document and print/save-PDF option. No private internal notes are included.</p>
        </div>

        <section className="email-composer-preview-panel" aria-label="Email preview">
          <div className="email-preview-toolbar">
            <strong>Preview</strong>
            <div className="email-preview-controls">
              <div className="segmented-control" role="group" aria-label="Email preview format">
                <button aria-pressed={previewMode === "html"} onClick={() => setPreviewMode("html")} type="button">Email</button>
                <button aria-pressed={previewMode === "text"} onClick={() => setPreviewMode("text")} type="button">Plain text</button>
              </div>
              {previewMode === "html" ? (
                <div className="segmented-control" role="group" aria-label="Email preview size">
                  <button aria-label="Desktop preview" aria-pressed={viewportMode === "desktop"} onClick={() => setViewportMode("desktop")} type="button"><Monitor aria-hidden="true" size={16} />Desktop</button>
                  <button aria-label="Mobile preview" aria-pressed={viewportMode === "mobile"} onClick={() => setViewportMode("mobile")} type="button"><Smartphone aria-hidden="true" size={16} />Mobile</button>
                </div>
              ) : null}
              <button className="email-full-preview-button" onClick={() => fullPreviewRef.current?.showModal()} type="button">
                <Maximize2 aria-hidden="true" size={16} />
                Open full preview
              </button>
            </div>
          </div>
          {previewMode === "html" ? (
            <div className={`email-preview-canvas ${viewportMode}`}>
              <BrandedEmailPreview draft={previewDraft} />
            </div>
          ) : <pre className="email-plain-text-preview">{plainText}</pre>}
        </section>

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

        <dialog
          aria-label="Full email preview"
          className="email-full-preview-dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
          ref={fullPreviewRef}
        >
          <header>
            <strong>{previewMode === "html" ? "Email preview" : "Plain-text preview"}</strong>
            <button aria-label="Close full preview" className="icon-button" onClick={() => fullPreviewRef.current?.close()} type="button"><X aria-hidden="true" size={20} /></button>
          </header>
          <div className={`email-full-preview-content ${viewportMode}`}>
            {previewMode === "html" ? <BrandedEmailPreview draft={previewDraft} /> : <pre className="email-plain-text-preview">{plainText}</pre>}
          </div>
        </dialog>
      </form>
    </section>
  );
}

function BrandedEmailPreview({ draft }: { draft: CustomerDocumentEmailDraft }) {
  const scopeBlocks = parseScopePresentation(draft.scopeText);
  return (
    <article className="branded-email-preview">
      <header><img alt="Angel Tree Services" src="/angel-tree-services-logo.jpg" /></header>
      <div className="branded-email-preview-body">
        <p>{draft.greeting}</p>
        <p className="email-preview-prewrap">{draft.intro}</p>
        <section>
          <strong>{draft.scopeHeading}</strong>
          <div className="email-preview-scope">
            {scopeBlocks.map((block, index) => {
              if (block.kind === "item") return <h4 className="email-preview-scope-item" key={`${block.kind}-${index}`}>{block.text}</h4>;
              if (block.kind === "heading") return <p className="email-preview-scope-context" key={`${block.kind}-${index}`}>{block.text}</p>;
              if (block.kind === "quantity") return <p className="email-preview-scope-quantity" key={`${block.kind}-${index}`}>Quantity: {block.text}</p>;
              if (block.kind === "price") return <div className="email-preview-scope-price" key={`${block.kind}-${index}`}><span>Price</span><strong>{block.text}</strong></div>;
              return <pre key={`${block.kind}-${index}`}>{block.text}</pre>;
            })}
          </div>
        </section>
        <dl>
          <div><dt>{draft.summaryLabel}</dt><dd>{draft.summaryValue}</dd></div>
          <div><dt>{draft.timingLabel}</dt><dd>{draft.timingValue}</dd></div>
        </dl>
        {draft.customerNotes ? <section className="email-preview-notes"><strong>Important notes</strong><pre>{draft.customerNotes}</pre></section> : null}
        <span className="email-preview-cta">{draft.ctaLabel}</span>
        <small>{draft.portalUrl
          ? <>If the button does not open, copy and paste this secure link into your browser.<br /><span>{draft.portalUrl}</span></>
          : "A secure customer link will be generated when this email is sent."}</small>
        <p className="email-preview-prewrap">{draft.closing}</p>
        <p>Thank you,<br /><br /><strong>Angel Tree Services</strong></p>
      </div>
      <footer>(540) 388-8715<br />info@angeltreeservice.org<br />angeltreeservices.org</footer>
    </article>
  );
}

function ComposerTextField({
  label,
  onReset,
  ...props
}: {
  label: string;
  onReset: () => void;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="email-composer-field">
      <div className="email-composer-field-heading">
        <label htmlFor={id}>{label}</label>
        <button onClick={onReset} type="button">Reset to generated text</button>
      </div>
      <input id={id} {...props} />
    </div>
  );
}

function ComposerTextarea({
  expandable = false,
  label,
  onChange,
  onReset,
  value,
  ...props
}: {
  expandable?: boolean;
  label: string;
  onReset: () => void;
  value: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value">) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const maximumHeight = expanded ? 520 : 280;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [expanded, value]);

  return (
    <div className="email-composer-field">
      <div className="email-composer-field-heading">
        <label htmlFor={id}>{label}</label>
        <span>
          <button onClick={onReset} type="button">Reset to generated text</button>
          {expandable ? (
            <button aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} type="button">
              <Expand aria-hidden="true" size={14} />
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </span>
      </div>
      <textarea
        className={expanded ? "expanded" : undefined}
        id={id}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange?.(event)}
        ref={textareaRef}
        value={value}
        {...props}
      />
    </div>
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
