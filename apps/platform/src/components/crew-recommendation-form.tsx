"use client";

import { useActionState } from "react";
import { Sprout } from "lucide-react";
import {
  submitCrewRecommendation,
  type CrewCloseoutActionState,
} from "@/app/crew/jobs/[jobId]/actions";

const initialState: CrewCloseoutActionState = { status: "idle", message: "" };

export function CrewRecommendationForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(
    submitCrewRecommendation,
    initialState,
  );
  return (
    <form action={action} className="crew-recommendation-form">
      <input name="job_id" type="hidden" value={jobId} />
      {state.message ? (
        <p
          className={`form-message ${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <label>
        What should we come back to do?
        <input name="title" placeholder="Reinspect rear oak" required />
      </label>
      <label>
        Recommendation
        <textarea
          name="description"
          placeholder="Describe the future work in clear language for office review."
          required
          rows={4}
        />
      </label>
      <label>
        Suggested timeframe
        <input
          name="timeframe"
          placeholder="This fall, within six months, next spring..."
        />
      </label>
      <label>
        Private crew context
        <textarea
          name="internal_notes"
          placeholder="Site observations for the office. Never shown to the customer automatically."
          rows={3}
        />
      </label>
      <button disabled={pending} type="submit">
        <Sprout size={18} />
        {pending ? "Sending..." : "Send recommendation to office"}
      </button>
      <p className="field-note">
        This does not create pricing, a quote, or scheduled work.
      </p>
    </form>
  );
}
