"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadPlatformDocument, type DocumentActionState } from "./actions";

type DocumentOption = { id: string; label: string };
export type DocumentLinkOptions = Record<
  "customer" | "organization" | "job" | "quote" | "invoice" | "employee" | "equipment",
  DocumentOption[]
>;

const initialState: DocumentActionState = { status: "idle", message: "" };

export function DocumentUploadForm({ canUploadSensitive, options }: {
  canUploadSensitive: boolean;
  options: DocumentLinkOptions;
}) {
  const [state, action, pending] = useActionState(uploadPlatformDocument, initialState);
  const [linkType, setLinkType] = useState<keyof DocumentLinkOptions | "">("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setLinkType("");
    }
  }, [state]);

  return (
    <form action={action} className="stacked-form" ref={formRef}>
      <label>
        <span>Document title</span>
        <input maxLength={180} name="title" placeholder="Insurance certificate" required />
      </label>
      <label>
        <span>Type</span>
        <select defaultValue="other" name="document_type" required>
          <option value="contract">Contract</option>
          <option value="proposal">Proposal</option>
          <option value="invoice">Invoice</option>
          <option value="work_order">Work order</option>
          <option value="insurance">Insurance</option>
          <option value="permit">Permit</option>
          <option value="safety">Safety</option>
          <option value="employee">Employee</option>
          <option value="equipment">Equipment</option>
          <option value="photo">Photo</option>
          <option value="receipt">Receipt</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        <span>Link to</span>
        <select name="link_type" onChange={(event) => setLinkType(event.target.value as keyof DocumentLinkOptions | "")} value={linkType}>
          <option value="">No linked record</option>
          <option value="customer">Customer</option>
          <option value="organization">Organization</option>
          <option value="job">Work order</option>
          <option value="quote">Quote</option>
          <option value="invoice">Invoice</option>
          <option value="employee">Employee</option>
          <option value="equipment">Equipment</option>
        </select>
      </label>
      {linkType ? (
        <label>
          <span>Linked record</span>
          <select name="link_id" required>
            <option value="">Choose a record</option>
            {options[linkType].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        <span>Expiration date (optional)</span>
        <input name="expires_at" type="date" />
      </label>
      {canUploadSensitive ? (
        <label className="checkbox-row">
          <input name="employee_sensitive" type="checkbox" />
          <span>Restrict as employee-sensitive</span>
        </label>
      ) : null}
      <label>
        <span>File</span>
        <input accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx,.xls,.xlsx" name="file" required type="file" />
        <small>PDF, image, text, Word, or Excel up to 25 MB.</small>
      </label>
      <button disabled={pending} type="submit">
        <Upload aria-hidden="true" size={18} />
        {pending ? "Uploading..." : "Upload document"}
      </button>
      {state.message ? <p className={`form-message ${state.status}`}>{state.message}</p> : null}
    </form>
  );
}
