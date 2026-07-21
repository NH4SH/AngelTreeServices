import type { ReactNode } from "react";
import { PlatformNavigation } from "@/components/PlatformNavigation";
import type { PlatformRoleName } from "@/lib/auth/roles";

export type PlatformNavigationId =
  | "admin"
  | "reports"
  | "employees"
  | "training"
  | "safety"
  | "customers"
  | "organizations"
  | "properties"
  | "jobs"
  | "quotes"
  | "change-orders"
  | "recurring"
  | "invoices"
  | "schedule"
  | "equipment"
  | "materials"
  | "communications"
  | "follow-ups"
  | "admin-time"
  | "payroll"
  | "access"
  | "documents"
  | "marketing"
  | "crew"
  | "crew-equipment"
  | "crew-team"
  | "crew-time"
  | "employee-self"
  | "portal";

type PlatformFrameProps = {
  active: PlatformNavigationId;
  children: ReactNode;
  roles?: PlatformRoleName[];
  userEmail?: string | null;
};

const crewNavigationIds = new Set<PlatformNavigationId>([
  "crew",
  "crew-equipment",
  "crew-team",
  "crew-time",
  "employee-self",
]);

export function PlatformFrame({ active, children, roles = [], userEmail }: PlatformFrameProps) {
  const audience = crewNavigationIds.has(active) ? "crew" : "admin";

  return (
    <main className="app-shell">
      <PlatformNavigation audience={audience} roles={roles} userEmail={userEmail} />
      <section className="app-main">
        {roles.length === 0 ? <p className="role-strip">This session has no assigned platform role.</p> : null}
        {children}
      </section>
    </main>
  );
}
