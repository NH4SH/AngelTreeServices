import type { ReactNode } from "react";
import { AccessStatusShell } from "@/components/access-status-shell";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getCurrentEmployeeAccessRequestFromClient } from "@/lib/data/access-requests";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const context = await getAuthenticatedPlatformContext("/admin");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  if (context.roles.length === 0) {
    const request = await getCurrentEmployeeAccessRequestFromClient(
      context.supabase,
      context.user.id,
      context.user.email ?? null,
    );

    return (
      <AccessStatusShell
        request={request.data}
        scope="admin"
        userEmail={context.user.email}
      />
    );
  }

  if (!hasAllowedRole(context.roles, platformRoleGroups.internalStaff)) {
    return <AccessStatusShell currentRoleLabel={context.roles.join(", ")} scope="admin" userEmail={context.user.email} />;
  }

  return children;
}
