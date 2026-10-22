"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { useId } from "react";

export function PrintButton({ href, label = "Print preview", showPrivacyHint = false }: { href?: string; label?: string; showPrivacyHint?: boolean }) {
  const hintId = useId();
  const descriptionId = showPrivacyHint ? hintId : undefined;
  const control = href ? (
    <Link aria-describedby={descriptionId} className="secondary-action button-reset document-print-button print-hidden" href={href} target="_blank">
      <Printer aria-hidden="true" size={18} />
      {label}
    </Link>
  ) : (
    <button aria-describedby={descriptionId} className="secondary-action button-reset document-print-button print-hidden" onClick={() => window.print()} type="button">
      <Printer aria-hidden="true" size={18} />
      {label}
    </button>
  );

  if (!showPrivacyHint) return control;

  return (
    <div className="document-print-controls print-hidden">
      {control}
      <p className="document-print-help" id={hintId}>Sharing this copy? Turn off headers and footers in the print dialog to keep your private link out of the file.</p>
    </div>
  );
}
