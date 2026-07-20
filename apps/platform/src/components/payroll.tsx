"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CheckCircle2, Lock, RotateCcw } from "lucide-react";
import {
  createPayPeriod,
  updatePayPeriodStatus,
  type PayrollActionState,
} from "@/lib/actions/payroll";
import type { PayPeriod } from "@/lib/types/database";

const initialState: PayrollActionState = {
  status: "idle",
  message: "",
};

export function CreatePayPeriodForm() {
  const [state, formAction, pending] = useReliableActionState(createPayPeriod, initialState);

  return (
    <form action={formAction} className="crm-form compact-form payroll-create-form">
      <div className="form-grid-two">
        <label>
          Start date
          <input name="starts_at" required type="date" />
        </label>
        <label>
          End date
          <input name="ends_at" required type="date" />
        </label>
      </div>
      <label>
        Notes
        <input name="notes" placeholder="Optional internal note for this review window" />
      </label>
      <button disabled={pending} type="submit">
        <RotateCcw aria-hidden="true" size={16} />
        {pending ? "Creating..." : "Create pay period"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function PayPeriodStatusForm({
  payPeriod,
}: {
  payPeriod: Pick<PayPeriod, "id" | "status">;
}) {
  const [state, formAction, pending] = useReliableActionState(updatePayPeriodStatus, initialState);

  return (
    <form action={formAction} className="payroll-status-form">
      <input name="pay_period_id" type="hidden" value={payPeriod.id} />
      <div className="time-review-button-row">
        <button disabled={pending || payPeriod.status === "review"} name="next_status" type="submit" value="review">
          <RotateCcw aria-hidden="true" size={16} />
          Move to review
        </button>
        <button disabled={pending || payPeriod.status === "approved"} name="next_status" type="submit" value="approved">
          <CheckCircle2 aria-hidden="true" size={16} />
          Approve period
        </button>
        <button className="secondary-action button-reset" disabled={pending || payPeriod.status === "exported"} name="next_status" type="submit" value="exported">
          Exported
        </button>
        <button className="secondary-action button-reset destructive-soft" disabled={pending || payPeriod.status === "locked"} name="next_status" type="submit" value="locked">
          <Lock aria-hidden="true" size={16} />
          Lock
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: { state: PayrollActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}
