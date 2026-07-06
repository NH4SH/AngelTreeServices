import type { ReactNode } from "react";
import { HardHat } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export default async function CrewLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the crew app" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/crew");
  }

  const roles = await getCurrentUserRolesFromClient(supabase, user.id);

  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) {
    return (
      <PlatformFrame active="portal" roles={roles} userEmail={user.email}>
        <div className="shell app-content">
          <section className="empty-state">
            <h2>Crew access required</h2>
            <p>This area is for crew and internal operations accounts only.</p>
            <p className="field-note">
              Assign a crew-capable role in Supabase before using the field app or time clock.
            </p>
          </section>
          <section className="notice-panel">
            <strong>
              <HardHat aria-hidden="true" size={18} />
              Current account
            </strong>
            <p>{user.email ?? "Signed-in account"} does not currently have crew app access.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  return children;
}
