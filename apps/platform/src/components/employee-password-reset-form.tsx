"use client";

import { useActionState, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  sendEmployeePasswordReset,
  type AccessRequestActionState,
} from "@/lib/actions/access-requests";
import type { ScheduleUser } from "@/lib/types/database";

const initialState: AccessRequestActionState = {
  status: "idle",
  message: "",
};

const confirmationCopy =
  "Send this employee a password reset email? They will receive a secure link to choose a new password.";

export function EmployeePasswordResetForm({ users }: { users: ScheduleUser[] }) {
  const [state, formAction, isPending] = useActionState(sendEmployeePasswordReset, initialState);
  const usersWithEmail = useMemo(
    () => users.filter((user) => Boolean(user.email)),
    [users],
  );
  const [selectedUserId, setSelectedUserId] = useState(usersWithEmail[0]?.id ?? "");

  return (
    <form
      action={formAction}
      className="employee-password-reset-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmationCopy)) {
          event.preventDefault();
        }
      }}
    >
      <div className="employee-password-reset-copy">
        <strong>Send password reset</strong>
        <p>
          Sends the employee a Supabase password reset email. Admins never see or handle the
          employee's password.
        </p>
      </div>

      <label>
        <span>Employee</span>
        <select
          disabled={usersWithEmail.length === 0 || isPending}
          name="user_id"
          onChange={(event) => setSelectedUserId(event.target.value)}
          value={selectedUserId}
        >
          {usersWithEmail.length ? (
            usersWithEmail.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email || "Unnamed employee"}
                {user.role_names.length ? `, ${user.role_names.join(", ")}` : ""}
              </option>
            ))
          ) : (
            <option value="">No active employees with email found</option>
          )}
        </select>
      </label>

      <button disabled={!selectedUserId || isPending} type="submit">
        <KeyRound aria-hidden="true" size={17} />
        {isPending ? "Sending..." : "Send reset email"}
      </button>

      {state.message ? (
        <p className={state.status === "error" ? "form-status error" : "form-status success"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
