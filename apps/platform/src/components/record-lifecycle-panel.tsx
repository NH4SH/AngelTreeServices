"use client";

import { Archive, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  updateRecordLifecycle,
  type LifecycleActionState,
  type RecordLifecyclePreview,
} from "@/lib/actions/record-lifecycle";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";

const initialState: LifecycleActionState = { status: "idle", message: "" };

type RecordLifecyclePanelProps = {
  canArchive: boolean;
  canPermanentlyDelete: boolean;
  compact?: boolean;
  listHref: string;
  preview: RecordLifecyclePreview;
};

export function RecordLifecyclePanel({ canArchive, canPermanentlyDelete, compact = false, listHref, preview }: RecordLifecyclePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledSuccessRef = useRef("");
  const router = useRouter();
  const [intent, setIntent] = useState<"archive" | "restore" | "permanent_delete">(preview.archivedAt ? "restore" : "archive");
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useReliableActionState(updateRecordLifecycle, initialState);

  useEffect(() => {
    if (state.status !== "success" || !state.message || handledSuccessRef.current === state.message) return;
    handledSuccessRef.current = state.message;
    dialogRef.current?.close();
    if (intent === "permanent_delete") router.push(listHref);
    else router.refresh();
  }, [intent, listHref, router, state.status]);

  if (!canArchive) return null;

  function open(nextIntent: typeof intent) {
    setIntent(nextIntent);
    setConfirmation("");
    dialogRef.current?.showModal();
  }

  const permanentAllowed = canPermanentlyDelete && preview.canPermanentDelete && preview.blockers.length === 0;
  const isPermanent = intent === "permanent_delete";

  return (
    <section className={`record-lifecycle-panel${compact ? " compact" : ""}`} aria-label={compact ? "Record management" : undefined} aria-labelledby={compact ? undefined : "record-management-heading"}>
      {!compact ? <div>
        <p className="surface-label">Record management</p>
        <h2 id="record-management-heading">Archive or remove</h2>
        <p>Archive keeps history and relationships intact. Permanent deletion is reserved for disposable test records.</p>
      </div> : null}
      <div className="record-lifecycle-actions">
        {preview.archivedAt ? (
          <button className="secondary-action" onClick={() => open("restore")} type="button">
            <RotateCcw aria-hidden="true" size={18} /> Restore record
          </button>
        ) : (
          <button className="secondary-action" onClick={() => open("archive")} type="button">
            <Archive aria-hidden="true" size={18} /> Archive record
          </button>
        )}
        {canPermanentlyDelete ? (
          <button className="danger-action" onClick={() => open("permanent_delete")} type="button">
            <Trash2 aria-hidden="true" size={18} /> Delete permanently
          </button>
        ) : null}
      </div>

      <dialog className="record-lifecycle-dialog" ref={dialogRef} onCancel={() => setConfirmation("")}>
        <form action={action} className="record-lifecycle-form">
          <input name="record_id" type="hidden" value={preview.recordId} />
          <input name="record_type" type="hidden" value={preview.recordType} />
          <input name="intent" type="hidden" value={intent} />
          <header>
            <div>
              <p className="surface-label">{isPermanent ? "Permanent deletion" : intent === "restore" ? "Restore record" : "Archive record"}</p>
              <h2>{preview.label}</h2>
            </div>
            <button aria-label="Close confirmation" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={20} /></button>
          </header>

          {isPermanent ? (
            <>
              <p><strong>This cannot be undone.</strong> The system will delete only the records shown below and will stop if protected history is found.</p>
              <dl className="record-delete-counts">
                {Object.entries(preview.counts).filter(([, count]) => count > 0).map(([label, count]) => (
                  <div key={label}><dt>{humanize(label)}</dt><dd>{count}</dd></div>
                ))}
              </dl>
              {preview.blockers.length ? (
                <section className="record-delete-blockers" role="status">
                  <strong>Permanent deletion is blocked</strong>
                  <ul>{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                  <p>Archive this record instead to keep the required history.</p>
                </section>
              ) : null}
              <label className="confirmation-field">
                <span>Type <strong>DELETE</strong> to confirm</span>
                <input autoComplete="off" name="confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
              </label>
            </>
          ) : (
            <p>{intent === "restore" ? "Restore this record to active lists and allow it to be selected for new work again?" : "Archive this record? It will leave active lists but retain all business history and can be restored later."}</p>
          )}

          {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <footer>
            <button className="secondary-action" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
            <button className={isPermanent ? "danger-action" : "primary-action"} disabled={pending || (isPermanent && (!permanentAllowed || confirmation !== "DELETE"))} type="submit">
              {pending ? "Working..." : isPermanent ? "Delete permanently" : intent === "restore" ? "Restore record" : "Archive record"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase());
}
