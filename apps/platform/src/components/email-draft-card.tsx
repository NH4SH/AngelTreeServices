"use client";

import { useState } from "react";
import { Clipboard, Copy, Mail } from "lucide-react";
import type { EmailDraft } from "@/lib/documents/email-drafts";

export function EmailDraftCard({ draft, embedded = false, label }: { draft: EmailDraft; embedded?: boolean; label: string }) {
  const [feedback, setFeedback] = useState("");

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback("Copy failed. Select the text manually.");
    }
  }

  return (
    <section className={`email-draft-card print-hidden${embedded ? " embedded-email-draft" : ""}`}>
      <p className="surface-label">
        <Mail aria-hidden="true" size={18} />
        {label}
      </p>
      <p className="email-draft-note">Draft only. This does not send an email.</p>
      <dl>
        <div>
          <dt>Subject</dt>
          <dd>{draft.subject}</dd>
        </div>
        <div>
          <dt>Body</dt>
          <dd><pre>{draft.body}</pre></dd>
        </div>
      </dl>
      <div className="email-draft-actions">
        <button onClick={() => copyText(draft.subject, "Subject copied.")} type="button">
          <Copy aria-hidden="true" size={17} />
          Copy subject
        </button>
        <button onClick={() => copyText(draft.body, "Body copied.")} type="button">
          <Clipboard aria-hidden="true" size={17} />
          Copy body
        </button>
        <button onClick={() => copyText(`Subject: ${draft.subject}\n\n${draft.body}`, "Full email copied.")} type="button">
          <Mail aria-hidden="true" size={17} />
          Copy full email
        </button>
      </div>
      {feedback ? <p className="email-copy-feedback" role="status">{feedback}</p> : null}
    </section>
  );
}
