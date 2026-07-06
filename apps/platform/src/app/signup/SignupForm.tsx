"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LockKeyhole, UserRoundPlus } from "lucide-react";
import {
  requestEmployeeAccess,
  type AccessRequestActionState,
  employeeRequestedRoleOptions,
} from "@/lib/actions/access-requests";

type SignupFormProps = {
  configured: boolean;
};

const initialState: AccessRequestActionState = {
  status: "idle",
  message: "",
};

export function SignupForm({ configured }: SignupFormProps) {
  const [state, formAction, pending] = useActionState(requestEmployeeAccess, initialState);
  const disabled = !configured || pending || state.status === "success";

  return (
    <form action={formAction} className="auth-form signup-form">
      {!configured ? (
        <div className="auth-message warning" role="status">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
          <code> apps/platform/.env.local</code>, then restart the dev server.
        </div>
      ) : null}

      {state.message ? (
        <div className={`auth-message ${state.status === "error" ? "error" : "success"}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}

      <label>
        Full name
        <input
          autoComplete="name"
          disabled={disabled}
          name="full_name"
          placeholder="Your name"
          required
          type="text"
        />
      </label>

      <div className="form-grid-two">
        <label>
          Email
          <input
            autoComplete="email"
            disabled={disabled}
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
        </label>

        <label>
          Phone
          <input
            autoComplete="tel"
            disabled={disabled}
            name="phone"
            placeholder="Optional phone"
            type="tel"
          />
        </label>
      </div>

      <div className="form-grid-two">
        <label>
          Password
          <input
            autoComplete="new-password"
            disabled={disabled}
            name="password"
            placeholder="At least 8 characters"
            required
            type="password"
          />
        </label>

        <label>
          Confirm password
          <input
            autoComplete="new-password"
            disabled={disabled}
            name="confirm_password"
            placeholder="Repeat password"
            required
            type="password"
          />
        </label>
      </div>

      <label>
        Requested role or use case
        <select defaultValue="crew" disabled={disabled} name="requested_role" required>
          {employeeRequestedRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Note
        <textarea
          disabled={disabled}
          name="note"
          placeholder="Optional note for the owner or office team."
          rows={4}
        />
      </label>

      <button disabled={disabled} type="submit">
        <LockKeyhole aria-hidden="true" size={18} />
        {pending ? "Submitting request..." : state.status === "success" ? "Request submitted" : "Request employee access"}
      </button>

      <div className="signup-footer-links">
        <Link className="secondary-action" href="/login">
          <UserRoundPlus aria-hidden="true" size={18} />
          Back to login
        </Link>
      </div>
    </form>
  );
}
