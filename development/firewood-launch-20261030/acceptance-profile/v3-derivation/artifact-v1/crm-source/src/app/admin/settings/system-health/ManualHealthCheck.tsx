"use client";

import { RefreshCw } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { runManualSystemHealthCheck, type HealthActionState } from "./actions";

const initialState: HealthActionState = { status: "idle", message: "" };

export function ManualHealthCheck() {
  const [state, action, pending] = useReliableActionState(runManualSystemHealthCheck, initialState);
  return (
    <form action={action} className="system-health-refresh">
      {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      <button disabled={pending} type="submit">
        <RefreshCw aria-hidden="true" className={pending ? "spin" : undefined} size={18} />
        {pending ? "Running checks..." : "Run checks now"}
      </button>
    </form>
  );
}
