import Link from "next/link";
import type { ReactNode } from "react";
import { HardHat, Leaf, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { PlatformRoleName } from "@/lib/auth/roles";

const navItems = [
  { href: "/admin", label: "Admin", Icon: ShieldCheck },
  { href: "/crew", label: "Crew", Icon: HardHat },
  { href: "/portal", label: "Portal", Icon: UsersRound },
];

type PlatformFrameProps = {
  active: "admin" | "crew" | "portal";
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

        <nav className="app-nav" aria-label="Platform navigation">
          {navItems.map((item) => (
            <Link
              aria-current={active === item.label.toLowerCase() ? "page" : undefined}
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
