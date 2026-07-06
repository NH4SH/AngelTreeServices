"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LockKeyhole, UserRoundPlus } from "lucide-react";
import { signInWithPassword, type LoginActionState } from "./actions";

type LoginFormProps = {
  configured: boolean;
  nextPath: string;
  signedOut: boolean;
};

const initialState: LoginActionState = {
  status: "idle",
  message: "",
};

export function LoginForm({ configured, nextPath, signedOut }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInWithPassword, initialState);
  const disabled = !configured || pending;

  return (
    <form action={formAction} className="auth-form">
      <input name="next" type="hidden" value={nextPath} />

      {!configured ? (
        <div className="auth-message warning" role="status">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
          <code> apps/platform/.env.local</code>, then restart the dev server.
        </div>
      ) : null}

      {signedOut ? (
        <div className="auth-message success" role="status">
          Signed out successfully.
        </div>
      ) : null}

      {state.message ? (
        <div className="auth-message error" role="alert">
          {state.message}
        </div>
      ) : null}

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
        Password
        <input
          autoComplete="current-password"
          disabled={disabled}
          name="password"
          placeholder="Your password"
          required
          type="password"
        />
      </label>

      <button disabled={disabled} type="submit">
        <LockKeyhole aria-hidden="true" size={18} />
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <div className="signup-footer-links">
        <Link className="secondary-action" href="/signup">
          <UserRoundPlus aria-hidden="true" size={18} />
          Request employee access
        </Link>
      </div>
    </form>
  );
}
