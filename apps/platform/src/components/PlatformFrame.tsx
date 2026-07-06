import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Building2,
  Files,
  FileText,
  HardHat,
  LayoutDashboard,
  Leaf,
  LogOut,
  Megaphone,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { PlatformRoleName } from "@/lib/auth/roles";

const navItems = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, match: "admin" },
  { href: "/admin/customers", label: "Customers", Icon: UsersRound, match: "customers" },
  { href: "/admin/organizations", label: "Organizations", Icon: Building2, match: "organizations" },
  { href: "/admin/jobs", label: "Jobs", Icon: Workflow, match: "jobs" },
  { href: "/admin/quotes", label: "Quotes", Icon: FileText, match: "quotes" },
  { href: "/admin/invoices", label: "Invoices", Icon: ReceiptText, match: "invoices" },
  { href: "/admin/schedule", label: "Schedule", Icon: CalendarDays, match: "schedule" },
  { href: "/admin/documents", label: "Documents", Icon: Files, match: "documents" },
  { href: "/admin/marketing", label: "Marketing", Icon: Megaphone, match: "marketing" },
  { href: "/crew", label: "Crew View", Icon: HardHat, match: "crew" },
  { href: "/portal", label: "Customer Portal", Icon: ShieldCheck, match: "portal" },
];

type PlatformFrameProps = {
  active:
    | "admin"
    | "customers"
    | "organizations"
    | "jobs"
    | "quotes"
    | "invoices"
    | "schedule"
    | "documents"
    | "marketing"
    | "crew"
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
  const activeItem = navItems.find((item) => item.match === active);

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <Link className="app-brand" href="/admin">
          <span className="app-brand-mark" aria-hidden="true">
            <Leaf size={18} />
          </span>
          <span>
            <strong>Angel Tree Platform</strong>
            <small>{userEmail ?? "Signed in"}</small>
          </span>
        </Link>

        <details className="mobile-nav">
          <summary>{activeItem?.label ?? "Menu"}</summary>
          <nav aria-label="Mobile platform navigation">
            {navItems.map((item) => (
              <Link
                aria-current={active === item.match ? "page" : undefined}
                href={item.href}
                key={item.href}
              >
                <item.Icon aria-hidden="true" size={18} />
                {item.label}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit">
                <LogOut aria-hidden="true" size={18} />
                Sign out
              </button>
            </form>
          </nav>
        </details>

        <nav className="app-nav" aria-label="Platform navigation">
          {navItems.map((item) => (
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
      </header>

      {roles.length > 0 ? (
        <p className="role-strip">Roles: {roles.join(", ")}</p>
      ) : (
        <p className="role-strip">
          Role checks are prepared, but this session has no assigned platform roles yet.
        </p>
      )}

      {children}
    </main>
  );
}
