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
  | "notifications"
  | "settings"
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
    <div className="app-shell">
      <a className="skip-to-content" href="#platform-main-content">
        Skip to main content
      </a>
      <PlatformNavigation audience={audience} roles={roles} userEmail={userEmail} />
      <main className="app-main" id="platform-main-content" tabIndex={-1}>
        {roles.length === 0 ? <p className="role-strip">This session has no assigned platform role.</p> : null}
        {children}
      </main>
    </div>
  );
}
