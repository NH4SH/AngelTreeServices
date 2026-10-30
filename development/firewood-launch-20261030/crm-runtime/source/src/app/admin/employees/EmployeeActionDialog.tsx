"use client";

import { useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

/** Presentation only. All authorization and mutations remain in the supplied server action. */
export function EmployeeActionDialog({
  employeeId,
  employeeName,
  action,
  label,
  description,
  consequences,
  reason = true,
  danger = false,
  disabled = false,
}: {
  employeeId: string;
  employeeName: string;
  action: (data: FormData) => Promise<void>;
  label: string;
  description: string;
  consequences: string[];
  reason?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const query = useSearchParams().toString();
  useEffect(() => {
    dialog.current?.close();
  }, [query]);
  return (
    <>
      <button
        className={
          danger ? "employee-button employee-button-danger" : "employee-button"
        }
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
        ref={trigger}
        type="button"
      >
        {label}
      </button>
      <dialog
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className="employee-dialog"
        onClose={() => trigger.current?.focus()}
        ref={dialog}
      >
        <form action={action} className="crm-form">
          <input name="employee_id" type="hidden" value={employeeId} />
          <DialogContent
            id={id}
            label={label}
            employeeName={employeeName}
            description={description}
            consequences={consequences}
            reason={reason}
            danger={danger}
            close={() => dialog.current?.close()}
            dialog={dialog}
          />
        </form>
      </dialog>
    </>
  );
}

function DialogContent({
  id,
  label,
  employeeName,
  description,
  consequences,
  reason,
  danger,
  close,
  dialog,
}: {
  id: string;
  label: string;
  employeeName: string;
  description: string;
  consequences: string[];
  reason: boolean;
  danger: boolean;
  close: () => void;
  dialog: React.RefObject<HTMLDialogElement | null>;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) dialog.current?.close();
    wasPending.current = pending;
  }, [pending, dialog]);
  useEffect(() => {
    const element = dialog.current;
    const preventPendingDismiss = (event: Event) => {
      if (pending) event.preventDefault();
    };
    element?.addEventListener("cancel", preventPendingDismiss);
    return () => element?.removeEventListener("cancel", preventPendingDismiss);
  }, [pending, dialog]);
  return (
    <>
      <div className="employee-dialog-heading">
        <h2 id={`${id}-title`}>{label}?</h2>
        <button
          aria-label="Close confirmation"
          className="employee-icon-button"
          disabled={pending}
          onClick={close}
          type="button"
        >
          <X size={20} />
        </button>
      </div>
      <p className="employee-dialog-name">{employeeName}</p>
      <p id={`${id}-description`}>{description}</p>
      <ul className="employee-consequences">
        {consequences.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {reason ? (
        <label htmlFor={`${id}-reason`}>
          Reason <span className="employee-muted">(required)</span>
          <textarea
            id={`${id}-reason`}
            maxLength={1000}
            name="reason"
            required
            rows={3}
          />
        </label>
      ) : null}
      <div className="employee-dialog-actions">
        <button
          autoFocus
          className="employee-button-quiet"
          disabled={pending}
          onClick={close}
          type="button"
        >
          Cancel
        </button>
        <button
          className={danger ? "employee-confirm-danger" : "employee-confirm"}
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : label}
        </button>
      </div>
      <p aria-live="polite" className="employee-muted">
        {pending ? "Saving this change. Please wait…" : ""}
      </p>
    </>
  );
}

/** Loading feedback for existing form actions that revalidate the employee record. */
export function EmployeeSubmitButton({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending ? "Saving…" : children}
    </button>
  );
}
