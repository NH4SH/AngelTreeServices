import { Leaf } from "lucide-react";
import { redirect } from "next/navigation";
import { AccessStatusShell } from "@/components/access-status-shell";
import {
  getCurrentUserRolesFromClient,
  hasAllowedRole,
  platformRoleGroups,
} from "@/lib/auth/roles";
import { getCurrentEmployeeAccessRequestFromClient } from "@/lib/data/access-requests";
import { createClient } from "@/lib/supabase/server";
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

  if (user) {
    if (hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
      redirect(nextPath.startsWith("/login") ? "/admin" : nextPath);
    }

    if (hasAllowedRole(roles, platformRoleGroups.crewApp)) {
      redirect(nextPath.startsWith("/crew") || nextPath.startsWith("/employee") ? nextPath : "/crew");
    }

    if (
      hasAllowedRole(roles, platformRoleGroups.customerPortal)
      || hasAllowedRole(roles, platformRoleGroups.organizationPortal)
    ) {
      redirect(nextPath.startsWith("/portal") ? nextPath : "/portal");
    }
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

        {!user ? (
          <LoginForm
            configured={configured}
            nextPath={nextPath}
            signedOut={params.signedOut === "true"}
          />
        ) : null}
        <p className="login-privacy-links">
          <a href="https://angeltreeservices.org/privacy/">Privacy policy</a>
          <span aria-hidden="true"> · </span>
          <a href="https://angeltreeservices.org/privacy-request/">Privacy or account request</a>
        </p>
      </section>
    </main>
  );
}
