"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeLocalRedirect } from "@/lib/security/local-redirect";
import { checkPasswordSignInRateLimit } from "@/lib/security/sign-in-rate-limit";

export type LoginActionState = {
  status: "idle" | "error";
  message: string;
};

export async function signInWithPassword(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Supabase is not configured yet. Add env vars to apps/platform/.env.local and restart the dev server.",
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeLocalRedirect(String(formData.get("next") || "/admin"));

  if (!email || email.length > 320 || !password) {
    return {
      status: "error",
      message: "Enter an email and password to sign in.",
    };
  }

  const budget = await checkPasswordSignInRateLimit(email, await headers());
  if (budget !== "allowed") {
    return {
      status: "error",
      message: budget === "limited"
        ? "Too many sign-in attempts. Wait a few minutes and try again."
        : "Sign-in is temporarily unavailable. Please try again shortly.",
    };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { status: "error", message: "The email or password was not accepted." };
    }
  } catch {
    return {
      status: "error",
      message: "Sign-in is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(nextPath);
}

export async function signOut() {
  const supabase = await createClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login?signedOut=true");
}
