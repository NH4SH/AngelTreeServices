"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeLocalRedirect } from "@/lib/security/local-redirect";

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

  if (!email || !password) {
    return {
      status: "error",
      message: "Enter an email and password to sign in.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      status: "error",
      message: "The email or password was not accepted.",
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
