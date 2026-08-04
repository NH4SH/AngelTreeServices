import { FlaskConical } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { LoadingLab } from "./LoadingLab";

export default async function LoadingLabPage() {
  const context = await getAuthenticatedPlatformContext("/admin/loading-lab");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the loading lab" />;
  }

  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);

  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content loading-lab-page">
        <section className="page-heading">
          <p className="surface-label"><FlaskConical aria-hidden="true" size={17} />Interface prototype</p>
          <h1>Loading animation lab</h1>
          <p>Compare three calligraphic tree-growth refinements before choosing a production loader.</p>
        </section>

        {allowed ? (
          <LoadingLab />
        ) : (
          <section className="empty-state">
            <h2>Owner or admin access required</h2>
            <p>Loading prototypes are restricted to platform administrators.</p>
          </section>
        )}
      </div>
    </PlatformFrame>
  );
}
