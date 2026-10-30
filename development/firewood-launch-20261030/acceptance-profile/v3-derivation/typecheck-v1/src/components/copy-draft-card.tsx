"use client";

import { Clipboard } from "lucide-react";
import { useState } from "react";

export function CopyDraftCard({
  body,
  label,
  note = "Draft only. Copy this text for review before using it.",
}: {
  body: string;
  label: string;
  note?: string;
}) {
  const [feedback, setFeedback] = useState("");

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(body);
      setFeedback("Draft copied.");
    } catch {
      setFeedback("Copy failed. Select the text manually.");
    }
  }

  return (
    <section className="copy-draft-card">
      <h3>{label}</h3>
      <p className="email-draft-note">{note}</p>
      <pre>{body}</pre>
      <button onClick={copyDraft} type="button">
        <Clipboard aria-hidden="true" size={17} />
        Copy draft
      </button>
      {feedback ? <p className="email-copy-feedback" role="status">{feedback}</p> : null}
    </section>
  );
}
