"use client";

import Link from "next/link";
import type { useDocumentRecovery } from "@/hooks/use-document-recovery";

export function DocumentRecoveryPanel({ recovery, listHref }: { recovery: ReturnType<typeof useDocumentRecovery>; listHref: string }) {
  const copy = recovery.candidate;
  const labels: Record<string, string> = { customer_message: "Customer notes", debris_handling: "Wood and chips plan", debris_handling_notes: "Wood / chips instructions", purchase_order_reference: "Purchase order / reference", payment_terms: "Payment terms", expires_at: "Expiration date", due_date: "Due date", notes: "Internal notes" };
  return <>
    {copy ? <section className="document-recovery" aria-label="Unsaved work found">
      <div><strong>Unsaved work found</strong><p>A recovery copy from {new Date(copy.savedAt).toLocaleString()} is available on this browser.</p>
        {recovery.stale ? <p>The saved record has changed. Review the copy below and copy any wording you need into the current record.</p> : <p>Restore it to keep editing, or discard it to use the saved record.</p>}
      </div>
      <div className="workflow-button-row">
        {!recovery.stale ? <button className="secondary-action" type="button" onClick={recovery.restore}>Restore unsaved work</button> : null}
        <button className="secondary-action" type="button" onClick={recovery.discard}>Discard recovery copy</button>
      </div>
      <details><summary>Review recovery copy</summary>
        <div className="recovery-preview">
          {Object.entries(copy.fields).filter(([name, value]) => value && labels[name]).map(([name, value]) => <p key={name}><strong>{labels[name]}</strong><br />{value.replaceAll("_", " ")}</p>)}
          {copy.lines.map((line, index) => <p key={index}><strong>Line {index + 1}: {line.name}</strong><br />{line.description}<br />Quantity {line.quantity}; unit price {line.unitPrice || "blank"}</p>)}
        </div>
      </details>
    </section> : null}
    {recovery.needsReview ? <section className="document-recovery" aria-label="Check previous save">
      <strong>Check whether the previous save finished</strong>
      <p>This copy was recovered after a save attempt. Check the list for the record before creating another.</p>
      <div className="workflow-button-row"><Link className="secondary-action" href={listHref} target="_blank" rel="noopener noreferrer">Check existing records</Link><button className="secondary-action" type="button" onClick={recovery.confirmReviewed}>I checked the list; continue editing</button></div>
    </section> : null}
    {recovery.message ? <p className="form-message error" role="alert">{recovery.message}</p> : null}
    <p className="form-help" role="status">{!recovery.ready && !recovery.message ? "Checking for a recovery copy…" : recovery.savedAt ? "Recovery copy saved on this browser. Recovery copies clear when you sign out." : "Unsaved work is kept on this browser for up to 24 hours. Recovery copies clear when you sign out."}</p>
  </>;
}
