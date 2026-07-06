"use client";

import { useActionState } from "react";
import { CheckCircle2, ShieldCheck, UserX } from "lucide-react";
import {
  approveEmployeeAccessRequest,
  rejectEmployeeAccessRequest,
  type AccessRequestActionState,
} from "@/lib/actions/access-requests";
import type {
  AccessApprovalRole,
  EmployeeAccessRequestWithReviewer,
} from "@/lib/data/access-requests";

const initialState: AccessRequestActionState = {
  status: "idle",
  message: "",
};

const approvalRoleOptions: { label: string; value: AccessApprovalRole }[] = [
  { label: "Crew", value: "crew" },
  { label: "Estimator", value: "estimator" },
  { label: "Admin", value: "admin" },
  { label: "Payroll admin", value: "payroll_admin" },
];

export function AccessRequestReviewForm({
  request,
}: {
  request: EmployeeAccessRequestWithReviewer;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveEmployeeAccessRequest,
    initialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectEmployeeAccessRequest,
    initialState,
  );
  const busy = approvePending || rejectPending;

  return (
    <div className="access-review-forms">
      <form action={approveAction} className="crm-form compact-form access-review-form">
        <input name="request_id" type="hidden" value={request.id} />
        <label>
          Role on approval
          <select defaultValue={defaultApprovalRole(request.requested_role)} name="approved_role" required>
            {approvalRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-field">
          <input defaultChecked={request.requested_role === "crew" || request.requested_role === "payroll_time_clock_only"} name="enable_time_clock" type="checkbox" value="true" />
          Enable time clock access now
        </label>
        <button disabled={busy} type="submit">
          <CheckCircle2 aria-hidden="true" size={16} />
          {approvePending ? "Approving..." : "Approve access"}
        </button>
        <InlineMessage state={approveState} />
      </form>

      <form action={rejectAction} className="crm-form compact-form access-review-form">
        <input name="request_id" type="hidden" value={request.id} />
        <label>
          Rejection note
          <textarea
            name="rejection_reason"
            placeholder="Optional note that explains why access was declined."
            rows={3}
          />
        </label>
        <button className="secondary-action button-reset destructive-soft" disabled={busy} type="submit">
          <UserX aria-hidden="true" size={16} />
          {rejectPending ? "Saving..." : "Reject request"}
        </button>
        <InlineMessage state={rejectState} />
      </form>
    </div>
  );
}

function defaultApprovalRole(requestedRole: string | null): AccessApprovalRole {
  switch (requestedRole) {
    case "crew":
      return "crew";
    case "estimator":
      return "estimator";
    case "payroll_time_clock_only":
      return "payroll_admin";
    default:
      return "admin";
  }
}

function InlineMessage({ state }: { state: AccessRequestActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={state.status === "error" ? "form-message error" : "form-message success"}
      role={state.status === "error" ? "alert" : "status"}
    >
      <ShieldCheck aria-hidden="true" size={15} />
      {state.message}
    </p>
  );
}
