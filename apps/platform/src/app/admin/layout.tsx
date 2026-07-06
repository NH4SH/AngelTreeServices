import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const roles = await getCurrentUserRolesFromClient(supabase, user.id);

  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return (
      <PlatformFrame active="portal" roles={roles} userEmail={user.email}>
        <div className="shell app-content">
          <section className="empty-state">
            <h2>Admin access required</h2>
            <p>This area is for internal Angel Tree staff accounts. Use a staff role such as owner, admin, estimator, or payroll admin.</p>
            <p className="field-note">
              If this account should have access, assign the role in Supabase first and then sign out and back in.
            </p>
          </section>
          <section className="notice-panel">
            <strong>
              <ShieldCheck aria-hidden="true" size={18} />
              Current account
            </strong>
            <p>{user.email ?? "Signed-in account"} does not currently have an internal staff role.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  return children;
}
