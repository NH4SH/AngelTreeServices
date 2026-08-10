"use client";

import { Archive, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { updateRecordLifecycle, type LifecycleActionState } from "@/lib/actions/record-lifecycle";

const initialState: LifecycleActionState = { status: "idle", message: "" };

type JobListLifecycleActionsProps = {
  archived: boolean;
  canArchive: boolean;
  canPermanentlyDelete: boolean;
  jobId: string;
  label: string;
};

type LifecycleIntent = "archive" | "restore" | "permanent_delete";

export function JobListLifecycleActions({ archived, canArchive, canPermanentlyDelete, jobId, label }: JobListLifecycleActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledSuccessRef = useRef("");
  const router = useRouter();
  const [intent, setIntent] = useState<LifecycleIntent>(archived ? "restore" : "archive");
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useReliableActionState(updateRecordLifecycle, initialState);

  useEffect(() => {
    if (state.status !== "success" || !state.message || handledSuccessRef.current === state.message) return;
    handledSuccessRef.current = state.message;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.message, state.status]);

  if (!canArchive) return null;

  function open(nextIntent: LifecycleIntent) {
    setIntent(nextIntent);
    setConfirmation("");
    dialogRef.current?.showModal();
  }

  const isPermanent = intent === "permanent_delete";

  return (
    <>
      {archived ? (
        <button className="jobs-more-button" onClick={() => open("restore")} type="button">
          <RotateCcw aria-hidden="true" size={16} /> Restore job
        </button>
      ) : (
        <button className="jobs-more-button" onClick={() => open("archive")} type="button">
          <Archive aria-hidden="true" size={16} /> Archive job
        </button>
      )}
      {archived && canPermanentlyDelete ? (
        <button className="jobs-more-button danger" onClick={() => open("permanent_delete")} type="button">
          <Trash2 aria-hidden="true" size={16} /> Delete permanently
        </button>
      ) : null}

      <dialog className="record-lifecycle-dialog" ref={dialogRef} onCancel={() => setConfirmation("")}>
        <form action={action} className="record-lifecycle-form">
          <input name="record_id" type="hidden" value={jobId} />
          <input name="record_type" type="hidden" value="job" />
          <input name="intent" type="hidden" value={intent} />
          <header>
            <div>
              <p className="surface-label">{isPermanent ? "Permanent deletion" : intent === "restore" ? "Restore job" : "Archive job"}</p>
              <h2>{label}</h2>
            </div>
            <button aria-label="Close confirmation" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={20} /></button>
          </header>

          {isPermanent ? (
            <>
              <p><strong>This cannot be undone.</strong> Permanent deletion is intended only for disposable or test jobs. The system will refuse the deletion if the job has protected billing, scheduling, crew, document, communication, or other business history.</p>
              <label className="confirmation-field">
                <span>Type <strong>DELETE</strong> to confirm</span>
                <input autoComplete="off" name="confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
              </label>
            </>
          ) : (
            <p>{intent === "restore" ? "Restore this job to the active Jobs views?" : "Archive this job? It will leave active Jobs views, keep its business history, and remain available from the Archived view."}</p>
          )}

          {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <footer>
            <button className="secondary-action" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
            <button className={isPermanent ? "danger-action" : "primary-action"} disabled={pending || (isPermanent && confirmation !== "DELETE")} type="submit">
              {pending ? "Working..." : isPermanent ? "Delete permanently" : intent === "restore" ? "Restore job" : "Archive job"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
