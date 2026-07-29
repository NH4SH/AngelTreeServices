"use client";

import { Archive, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { updateWebsiteLeadLifecycle, type LeadLifecycleState } from "./lead-actions";

const initialState: LeadLifecycleState = { status: "idle", message: "" };
type Intent = "spam" | "archive" | "restore" | "permanent_delete";

export function LeadLifecycleActions({
  canDelete,
  disposition,
  jobId,
  label,
}: {
  canDelete: boolean;
  disposition: "active" | "spam" | "archived";
  jobId: string;
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>("spam");
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useReliableActionState(updateWebsiteLeadLifecycle, initialState);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.status]);

  function open(next: Intent) {
    setIntent(next);
    setConfirmation("");
    dialogRef.current?.showModal();
  }

  return (
    <>
      <div className="lead-lifecycle-actions">
        {disposition === "active" ? (
          <>
            <button onClick={() => open("spam")} type="button"><ShieldAlert size={15} />Mark as spam</button>
            <button onClick={() => open("archive")} type="button"><Archive size={15} />Archive</button>
          </>
        ) : (
          <button onClick={() => open("restore")} type="button"><RotateCcw size={15} />Restore</button>
        )}
        {canDelete ? <button className="danger-text-action" onClick={() => open("permanent_delete")} type="button"><Trash2 size={15} />Delete</button> : null}
      </div>

      <dialog className="confirmation-dialog" ref={dialogRef}>
        <form action={action}>
          <input name="job_id" type="hidden" value={jobId} />
          <input name="intent" type="hidden" value={intent} />
          <header><div><span>Website lead</span><h2>{actionTitle(intent)}</h2></div><button aria-label="Close" onClick={() => dialogRef.current?.close()} type="button"><X size={18} /></button></header>
          <p><strong>{label}</strong></p>
          <p>{confirmationCopy(intent)}</p>
          {intent === "permanent_delete" ? <label>Type DELETE to confirm<input autoComplete="off" name="confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></label> : null}
          {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <footer>
            <button className="secondary-action" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
            <button className={intent === "permanent_delete" ? "danger-action" : "primary-action"} disabled={pending || (intent === "permanent_delete" && confirmation !== "DELETE")} type="submit">
              {pending ? "Working..." : actionTitle(intent)}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

function actionTitle(intent: Intent) {
  if (intent === "spam") return "Mark as spam";
  if (intent === "archive") return "Archive lead";
  if (intent === "restore") return "Restore lead";
  return "Delete permanently";
}

function confirmationCopy(intent: Intent) {
  if (intent === "spam") return "Remove this lead from active work and cancel pending follow-ups? It can be restored from the Spam view.";
  if (intent === "archive") return "Archive this lead without classifying it as spam? Its history will remain available.";
  if (intent === "restore") return "Return this lead to the active inbox so staff can schedule or convert it?";
  return "This is permanent and owner-only. Deletion will be blocked if the lead has schedule, quote, communication, document, or other protected history.";
}
