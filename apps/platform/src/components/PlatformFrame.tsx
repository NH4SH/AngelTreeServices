import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Building2,
  Clock3,
  Files,
  FileText,
  Forklift,
  HardHat,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  LogOut,
  Megaphone,
  MessageSquareMore,
  ReceiptText,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import {
  hasAllowedRole,
  platformRoleGroups,
  type PlatformRoleName,
} from "@/lib/auth/roles";

const navItems = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, match: "admin" },
  { href: "/admin/employees", label: "Employees", Icon: UsersRound, match: "employees", visibility: "staff" },
  { href: "/admin/training", label: "Training", Icon: GraduationCap, match: "training", visibility: "staff" },
  { href: "/admin/safety", label: "Safety", Icon: ShieldCheck, match: "safety", visibility: "staff" },
  { href: "/admin/customers", label: "Customers", Icon: UsersRound, match: "customers" },
  { href: "/admin/organizations", label: "Organizations", Icon: Building2, match: "organizations" },
  { href: "/admin/jobs", label: "Jobs", Icon: Workflow, match: "jobs" },
  { href: "/admin/quotes", label: "Quotes", Icon: FileText, match: "quotes" },
  { href: "/admin/invoices", label: "Invoices", Icon: ReceiptText, match: "invoices" },
  { href: "/admin/schedule", label: "Schedule", Icon: CalendarDays, match: "schedule" },
  { href: "/admin/equipment", label: "Equipment", Icon: Forklift, match: "equipment" },
  { href: "/admin/communications", label: "Communications", Icon: MessageSquareMore, match: "communications" },
  { href: "/admin/time", label: "Time", Icon: Clock3, match: "admin-time", visibility: "review" },
  { href: "/admin/payroll", label: "Payroll", Icon: ReceiptText, match: "payroll", visibility: "review" },
  { href: "/admin/access", label: "Access", Icon: UserCheck, match: "access", visibility: "approval" },
  { href: "/admin/documents", label: "Documents", Icon: Files, match: "documents" },
  { href: "/admin/marketing", label: "Marketing", Icon: Megaphone, match: "marketing" },
  { href: "/crew", label: "Crew View", Icon: HardHat, match: "crew" },
  { href: "/crew/equipment", label: "Assigned Equipment", Icon: Forklift, match: "crew-equipment" },
  { href: "/crew/team", label: "My Crew", Icon: UsersRound, match: "crew-team", visibility: "eligible" },
  { href: "/crew/time", label: "Time Clock", Icon: Clock3, match: "crew-time", visibility: "eligible" },
  { href: "/employee", label: "My Employee Profile", Icon: UserCheck, match: "employee-self" },
  { href: "/portal", label: "Customer Portal", Icon: ShieldCheck, match: "portal" },
];

type PlatformFrameProps = {
  active:
    | "admin"
    | "employees"
    | "training"
    | "safety"
    | "customers"
    | "organizations"
    | "jobs"
    | "quotes"
    | "invoices"
    | "schedule"
    | "equipment"
    | "communications"
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
  children: ReactNode;
  roles?: PlatformRoleName[];
  userEmail?: string | null;
};

export function PlatformFrame({
  active,
  children,
  roles = [],
  userEmail,
}: PlatformFrameProps) {
  const visibleNavItems = navItems.filter((item) => {
    if (item.visibility === "review") {
      return hasAllowedRole(roles, platformRoleGroups.timeClockReview);
    }

    if (item.visibility === "eligible") {
      return hasAllowedRole(roles, platformRoleGroups.timeClockEligible);
    }

    if (item.visibility === "approval") {
      return hasAllowedRole(roles, platformRoleGroups.accessApproval);
    }

    if (item.visibility === "staff") {
      return hasAllowedRole(roles, platformRoleGroups.internalStaff);
    }

    return true;
  });
  const activeItem = visibleNavItems.find((item) => item.match === active) ?? navItems.find((item) => item.match === active);
  const roleSummary = roles.length > 0 ? roles.join(", ") : "No role assigned";

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <Link className="app-brand" href="/admin">
            <span className="app-brand-mark" aria-hidden="true">
              <Leaf size={17} />
            </span>
            <span>
              <strong>Angel Tree</strong>
              <small>Operations</small>
            </span>
          </Link>
        </div>

        <nav className="app-nav" aria-label="Platform navigation">
          {visibleNavItems.map((item) => (
            <Link
              aria-current={active === item.match ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              <item.Icon aria-hidden="true" size={16} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-user">
            <small>Signed in</small>
            <strong>{userEmail ?? "Platform user"}</strong>
            <span>{roleSummary}</span>
          </div>
          <form action={signOut}>
            <button className="app-signout" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-mobilebar">
          <Link className="app-brand" href="/admin">
            <span className="app-brand-mark" aria-hidden="true">
              <Leaf size={17} />
            </span>
            <span>
              <strong>Angel Tree</strong>
              <small>{userEmail ?? "Operations"}</small>
            </span>
          </Link>

          <details className="mobile-nav">
            <summary>{activeItem?.label ?? "Menu"}</summary>
            <nav aria-label="Mobile platform navigation">
              {visibleNavItems.map((item) => (
                <Link
                  aria-current={active === item.match ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  <item.Icon aria-hidden="true" size={17} />
                  {item.label}
                </Link>
              ))}
              <form action={signOut}>
                <button type="submit">
                  <LogOut aria-hidden="true" size={17} />
                  Sign out
                </button>
              </form>
            </nav>
          </details>
        </header>

        {roles.length === 0 ? (
          <p className="role-strip">
            Role checks are prepared, but this session has no assigned platform roles yet.
          </p>
        ) : null}

        {children}
      </section>
    </main>
  );
}
