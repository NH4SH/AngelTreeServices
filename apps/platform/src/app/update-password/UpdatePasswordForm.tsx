"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type FormStatus = {
  tone: "idle" | "success" | "error" | "info";
  message: string;
};

export function UpdatePasswordForm() {
  const [status, setStatus] = useState<FormStatus>({
    tone: "info",
    message: "Checking your reset link...",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    if (!supabase) {
      setStatus({
        tone: "error",
        message: "Supabase is not configured. Contact an admin before changing your password.",
      });
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      if (data.session) {
        setIsReady(true);
        setStatus({ tone: "info", message: "Reset link accepted. Enter your new password." });
      } else {
        setStatus({
          tone: "info",
          message: "Open this page from the password reset email so the secure reset link can be verified.",
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || session) {
        setIsReady(true);
        setStatus({ tone: "info", message: "Reset link accepted. Enter your new password." });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();

    if (!supabase) {
      setStatus({ tone: "error", message: "Supabase is not configured." });
      return;
    }

    if (password.length < 8) {
      setStatus({ tone: "error", message: "Choose a password with at least 8 characters." });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ tone: "error", message: "The password confirmation does not match." });
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setStatus({ tone: "error", message: "The password could not be updated. Request a new reset link and try again." });
      return;
    }

    await supabase.auth.signOut();
    setPassword("");
    setConfirmPassword("");
    setIsReady(false);
    setStatus({ tone: "success", message: "Password updated. You can sign in with your new password." });
  }

  return (
    <form className="auth-form update-password-form" onSubmit={handleSubmit}>
      {status.message ? (
        <div className={`auth-message ${status.tone === "success" ? "success" : status.tone === "error" ? "error" : "warning"}`} role={status.tone === "error" ? "alert" : "status"}>
          {status.message}
        </div>
      ) : null}

      <label>
        New password
        <input
          autoComplete="new-password"
          disabled={!isReady || isSubmitting}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      <label>
        Confirm new password
        <input
          autoComplete="new-password"
          disabled={!isReady || isSubmitting}
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </label>

      <button disabled={!isReady || isSubmitting} type="submit">
        <LockKeyhole aria-hidden="true" size={18} />
        {isSubmitting ? "Updating..." : "Update password"}
      </button>

      <div className="signup-footer-links">
        <Link className="secondary-action" href="/login">
          <CheckCircle2 aria-hidden="true" size={18} />
          Back to login
        </Link>
      </div>
    </form>
  );
}
