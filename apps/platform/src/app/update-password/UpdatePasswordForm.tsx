"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import {
  grantPasswordRecovery,
  recoveryGrantMatchesUser,
  type PasswordRecoveryGrant,
} from "@/lib/security/password-recovery";
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
  const [recoveryGrant, setRecoveryGrant] = useState<PasswordRecoveryGrant | null>(null);
  const submittingRef = useRef(false);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      const grant = grantPasswordRecovery(event, session);
      if (!grant) return;

      setRecoveryGrant(grant);
      setIsReady(true);
      setStatus({ tone: "info", message: "Secure recovery link accepted. Enter a new password for this account." });
    });

    const verificationTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setStatus((current) => current.message === "Checking your reset link..."
        ? {
            tone: "error",
            message: "This password recovery link is invalid or expired. Ask an owner or admin to send a new reset email.",
          }
        : current);
    }, 4_000);

    return () => {
      mounted = false;
      window.clearTimeout(verificationTimeout);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const supabase = createClient();

    if (!supabase) {
      setStatus({ tone: "error", message: "Supabase is not configured." });
      return;
    }

    if (!recoveryGrant) {
      setIsReady(false);
      setStatus({ tone: "error", message: "This password recovery link is invalid or expired. Request a new reset email." });
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

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !recoveryGrantMatchesUser(recoveryGrant, user)) {
        setIsReady(false);
        setRecoveryGrant(null);
        setStatus({
          tone: "error",
          message: "The active account does not match this recovery link. Request a new reset email and try again.",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setStatus({ tone: "error", message: "The password could not be updated. Request a new reset link and try again." });
        return;
      }

      await supabase.auth.signOut({ scope: "global" });
      setPassword("");
      setConfirmPassword("");
      setIsReady(false);
      setRecoveryGrant(null);
      setStatus({ tone: "success", message: "Password updated. You can sign in with your new password." });
    } catch {
      setStatus({
        tone: "error",
        message: "The password could not be updated because the secure session could not be verified. Try again or request a new reset email.",
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
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
