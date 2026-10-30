"use client";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { retryPlatformDocumentScan, type DocumentActionState } from "./actions";
const initial: DocumentActionState = { status: "idle", message: "" };
export function DocumentScanControl({ id }: { id: string }) {
  const [state, action, pending] = useReliableActionState(retryPlatformDocumentScan, initial);
  return <form action={action}>
    <input type="hidden" name="document_id" value={id} />
    <button className="secondary-action" disabled={pending} type="submit">{pending ? "Checking file…" : "Check file"}</button>
    {state.message ? <p aria-live="polite" className={`form-message ${state.status}`}>{state.message}</p> : null}
  </form>;
}
