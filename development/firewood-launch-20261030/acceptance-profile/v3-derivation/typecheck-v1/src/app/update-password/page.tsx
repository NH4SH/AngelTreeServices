import { LockKeyhole } from "lucide-react";
import { SetupRequired } from "@/components/SetupRequired";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before updating a password" />;
  }

  return (
    <main className="shell narrow-shell">
      <section className="login-panel">
        <p className="surface-label">
          <LockKeyhole aria-hidden="true" size={18} />
          Password reset
        </p>
        <h1>Choose a new password</h1>
        <p>Enter a new password for your Angel Tree Platform account.</p>
        <UpdatePasswordForm />
      </section>
    </main>
  );
}
