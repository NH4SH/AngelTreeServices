import Link from "next/link";
import { Leaf, LogOut, ShieldCheck } from "lucide-react";
import { AccessStatusShell } from "@/components/access-status-shell";
import {
  getCurrentUserRolesFromClient,
  hasAllowedRole,
  platformRoleGroups,
} from "@/lib/auth/roles";
import { getCurrentEmployeeAccessRequestFromClient } from "@/lib/data/access-requests";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { LoginForm } from "./LoginForm";
import { safeLocalRedirect } from "@/lib/security/local-redirect";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeLocalRedirect(params.next);
  const supabase = await createClient();
  const configured = Boolean(supabase);
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const roles = user && supabase
    ? await getCurrentUserRolesFromClient(supabase, user.id)
    : [];
  const request = user && supabase
    ? await getCurrentEmployeeAccessRequestFromClient(supabase, user.id, user.email ?? null)
    : { data: null, error: null };

  if (user && roles.length === 0) {
    return (
      <AccessStatusShell
        request={request.data}
        scope="platform"
        userEmail={user.email}
      />
    );
  }

  return (
    <main className="shell narrow-shell">
      <section className="login-panel">
        <p className="surface-label">
          <Leaf aria-hidden="true" size={18} />
          Angel Tree Platform
        </p>
        <h1>Sign in</h1>
        <p>Use your Angel Tree operations account to open the protected workspace.</p>

        {user ? (
          <div className="signed-in-panel">
            <div>
              <strong>Signed in as {user.email}</strong>
              <p>You can open the workspace this account is approved for or sign out.</p>
            </div>
            <div className="action-row">
              {hasAllowedRole(roles, platformRoleGroups.internalStaff) ? (
                <Link className="primary-action" href="/admin">
                  <ShieldCheck aria-hidden="true" size={18} />
                  Open admin
                </Link>
              ) : hasAllowedRole(roles, platformRoleGroups.crewApp) ? (
                <Link className="primary-action" href="/crew">
                  <ShieldCheck aria-hidden="true" size={18} />
                  Open crew
                </Link>
              ) : (
                <Link className="primary-action" href={nextPath}>
                  <ShieldCheck aria-hidden="true" size={18} />
                  Continue
                </Link>
              )}
              <form action={signOut}>
                <button className="secondary-action button-reset" type="submit">
                  <LogOut aria-hidden="true" size={18} />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <LoginForm
            configured={configured}
            nextPath={nextPath}
            signedOut={params.signedOut === "true"}
          />
        )}
      </section>
    </main>
  );
}
