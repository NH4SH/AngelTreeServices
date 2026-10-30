"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { useEffect, useMemo, useState } from "react";
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

export function EmployeePasswordResetForm({
  users,
  disabledReason,
}: {
  users: ScheduleUser[];
  disabledReason?: string;
}) {
  const [state, formAction, isPending] = useReliableActionState(
    sendEmployeePasswordReset,
    initialState,
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const usersWithEmail = useMemo(
    () => users.filter((user) => Boolean(user.email)),
    [users],
  );
  const [selectedUserId, setSelectedUserId] = useState(
    usersWithEmail[0]?.id ?? "",
  );
  const isCoolingDown = cooldownSeconds > 0;

  useEffect(() => {
    if (state.status === "success") {
      setCooldownSeconds(60);
    }
  }, [state.status, state.message]);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(
      () => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  return (
    <form
      action={formAction}
      className="employee-password-reset-form"
      onSubmit={(event) => {
        if (disabledReason || !window.confirm(confirmationCopy)) {
          event.preventDefault();
        }
      }}
    >
      <div className="employee-password-reset-copy">
        <strong>Send password reset</strong>
        <p>
          Sends a secure link so the employee can choose a new password. You
          won’t see their password.
        </p>
      </div>

      <label>
        <span>Employee</span>
        <select
          disabled={Boolean(disabledReason) || usersWithEmail.length === 0 || isPending}
          name="user_id"
          onChange={(event) => setSelectedUserId(event.target.value)}
          value={selectedUserId}
        >
          {usersWithEmail.length ? (
            usersWithEmail.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email || "Unnamed employee"}
                {user.role_names.length
                  ? `, ${user.role_names.join(", ")}`
                  : ""}
              </option>
            ))
          ) : (
            <option value="">No active employees with email found</option>
          )}
        </select>
      </label>

      <button
        disabled={Boolean(disabledReason) || !selectedUserId || isPending || isCoolingDown}
        aria-describedby={disabledReason ? "employee-reset-unavailable" : undefined}
        type="submit"
      >
        <KeyRound aria-hidden="true" size={17} />
        {isPending
          ? "Sending..."
          : isCoolingDown
            ? `Wait ${cooldownSeconds}s`
            : "Send reset email"}
      </button>

      {disabledReason ? <p id="employee-reset-unavailable" className="field-note">{disabledReason}</p> : null}

      {isCoolingDown ? (
        <p className="field-note">
          A reset email was just sent. Wait {cooldownSeconds} seconds before
          sending another.
        </p>
      ) : null}

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "form-status error"
              : "form-status success"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
