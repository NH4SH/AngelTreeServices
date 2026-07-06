import { Leaf } from "lucide-react";
import { AccessStatusShell } from "@/components/access-status-shell";
import { SetupRequired } from "@/components/SetupRequired";
import { SignupForm } from "./SignupForm";
import { getCurrentUserRolesFromClient } from "@/lib/auth/roles";
import { getCurrentEmployeeAccessRequestFromClient } from "@/lib/data/access-requests";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening employee signup" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [roles, request] = await Promise.all([
      getCurrentUserRolesFromClient(supabase, user.id),
      getCurrentEmployeeAccessRequestFromClient(supabase, user.id, user.email ?? null),
    ]);

    if (roles.length === 0) {
      return (
        <AccessStatusShell
          request={request.data}
          scope="platform"
          userEmail={user.email}
        />
      );
    }
  }

  return (
    <main className="shell narrow-shell">
      <section className="login-panel">
        <p className="surface-label">
          <Leaf aria-hidden="true" size={18} />
          Angel Tree Platform
        </p>
        <h1>Employee access request</h1>
        <p>
          Create your sign-in, tell the office what you need access for, and wait for an
          owner or admin to approve the account before using the app.
        </p>
        <SignupForm configured />
      </section>
    </main>
  );
}
