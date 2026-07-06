"use client";

import { useActionState, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  resetCrewViewPreferences,
  type AccessRequestActionState,
} from "@/lib/actions/access-requests";
import type { ScheduleUser } from "@/lib/types/database";

const initialState: AccessRequestActionState = {
  status: "idle",
  message: "",
};

const confirmationCopy =
  "Reset this employee's crew view? This only resets display preferences and saved filters. It will not delete jobs, time, photos, or payroll data.";

export function ResetCrewViewForm({ users }: { users: ScheduleUser[] }) {
  const [state, formAction, isPending] = useActionState(resetCrewViewPreferences, initialState);
  const crewUsers = useMemo(
    () => users.filter((user) => user.role_names.includes("crew")),
    [users],
  );
  const [selectedUserId, setSelectedUserId] = useState(crewUsers[0]?.id ?? "");
  const selectedUser = crewUsers.find((user) => user.id === selectedUserId) ?? null;

  return (
    <form
      action={formAction}
      className="crew-view-reset-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmationCopy)) {
          event.preventDefault();
        }
      }}
    >
      <div className="crew-view-reset-copy">
        <strong>Reset crew view</strong>
        <p>
          Clear saved display preferences and filters for one crew employee. Jobs, time, photos,
          payroll data, roles, and schedule events stay unchanged.
        </p>
      </div>

      <label>
        <span>Crew employee</span>
        <select
          disabled={crewUsers.length === 0 || isPending}
          name="user_id"
          onChange={(event) => setSelectedUserId(event.target.value)}
          value={selectedUserId}
        >
          {crewUsers.length ? (
            crewUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email || "Unnamed crew member"}
              </option>
            ))
          ) : (
            <option value="">No active crew users found</option>
          )}
        </select>
      </label>

      <button disabled={!selectedUserId || isPending} type="submit">
        <RotateCcw aria-hidden="true" size={17} />
        {isPending ? "Resetting..." : "Reset view"}
      </button>

      {selectedUser?.crew_view_reset_requested_at ? (
        <p className="field-note">
          Last reset requested {formatDateTime(selectedUser.crew_view_reset_requested_at)}.
        </p>
      ) : null}

      {state.message ? (
        <p className={state.status === "error" ? "form-status error" : "form-status success"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
