"use client";

import { useActionState } from "react";
import { CheckCircle2, Play } from "lucide-react";
import { updateCrewJobStatus, type CrewStatusActionState } from "./actions";
import type { JobStatus } from "@/lib/types/database";

const initialState: CrewStatusActionState = {
  status: "idle",
  message: "",
};

export function CrewStatusActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [state, formAction, pending] = useActionState(updateCrewJobStatus, initialState);
  const nextStatus = status === "scheduled" ? "in_progress" : status === "in_progress" ? "completed" : null;

  return (
    <section className="crew-panel">
      <div className="crew-panel-heading">
        <span className="crew-panel-icon" aria-hidden="true">
          <CheckCircle2 size={19} />
        </span>
        <div>
          <h2>Status update</h2>
          <p>Current status: {status.replace("_", " ")}</p>
        </div>
      </div>
      <form action={formAction} className="crew-status-form">
        <input name="job_id" type="hidden" value={jobId} />
        <input name="next_status" type="hidden" value={nextStatus ?? ""} />
        <button disabled={pending || !nextStatus} type="submit">
          <Play aria-hidden="true" size={18} />
          {nextStatus ? `Mark ${nextStatus.replace("_", " ")}` : "No status action"}
        </button>
      </form>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <p className="field-note">
        Status changes still depend on RLS. Do not broaden policies until crew assignment rules are ready.
      </p>
    </section>
  );
}
