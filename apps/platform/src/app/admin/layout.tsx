import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AccessStatusShell } from "@/components/access-status-shell";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getCurrentEmployeeAccessRequestFromClient } from "@/lib/data/access-requests";
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

  if (roles.length === 0) {
    const request = await getCurrentEmployeeAccessRequestFromClient(supabase, user.id, user.email ?? null);

    return (
      <AccessStatusShell
        request={request.data}
        scope="admin"
        userEmail={user.email}
      />
    );
  }

  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return <AccessStatusShell currentRoleLabel={roles.join(", ")} scope="admin" userEmail={user.email} />;
  }

  return children;
}
