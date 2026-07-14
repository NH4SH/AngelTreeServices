"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";
import type { DuplicateRecordActionState } from "@/lib/actions/duplicate-records";

const initialState: DuplicateRecordActionState = {
  status: "idle",
  message: "",
};

const confirmationCopy =
  "This will create a new draft copy. It will not copy portal links, payments, emails, or completion history.";

type DuplicateAction = (
  previousState: DuplicateRecordActionState,
  formData: FormData,
) => Promise<DuplicateRecordActionState>;

export function DuplicateRecordButton({
  action,
  buttonClassName = "secondary-action",
  hiddenFieldName,
  hiddenFieldValue,
  label,
  pendingLabel = "Duplicating...",
}: {
  action: DuplicateAction;
  buttonClassName?: string;
  hiddenFieldName: "quote_id" | "invoice_id" | "job_id";
  hiddenFieldValue: string;
  label: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="inline-action-form duplicate-action-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmationCopy)) {
          event.preventDefault();
        }
      }}
    >
      <input name={hiddenFieldName} type="hidden" value={hiddenFieldValue} />
      <button className={buttonClassName} disabled={pending} type="submit">
        <Copy aria-hidden="true" size={16} />
        {pending ? pendingLabel : label}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
