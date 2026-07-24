import Link from "next/link";
import { HardHat, Leaf, LogIn, ShieldCheck, Sprout, UsersRound } from "lucide-react";

const platformAreas = [
  {
    href: "/admin",
    title: "Admin CRM",
    description: "Lead intake, estimates, quotes, scheduling, invoices, and follow-ups.",
    Icon: ShieldCheck,
  },
  {
    href: "/portal",
    title: "Customer Portal",
    description: "A secure future home for quotes, approvals, invoices, payments, and photos.",
    Icon: UsersRound,
  },
  {
    href: "/crew",
    title: "Crew View",
    description: "A field-first mobile surface for today's jobs, directions, notes, and completion photos.",
    Icon: HardHat,
  },
];

export default function PlatformHome() {
  return (
    <main className="shell">
      <section className="hero-panel">
        <p className="surface-label">
          <Sprout aria-hidden="true" size={18} />
          Angel Tree Services Platform
        </p>
        <h1>Angel Tree platform</h1>
        <p className="hero-copy">
          Protected operations workspace for CRM, scheduling, crew work, quote review, and customer portal workflows.
        </p>
        <div className="action-row">
          <a className="primary-action" href="/admin">
            <Leaf aria-hidden="true" size={18} />
            Open admin
          </a>
          <Link className="secondary-action" href="/login">
            <LogIn aria-hidden="true" size={18} />
            Sign in
          </Link>
        </div>
      </section>

      <section className="area-grid" aria-label="Platform areas">
        {platformAreas.map((area) => (
          <Link className="area-card" href={area.href} key={area.href}>
            <area.Icon aria-hidden="true" className="card-icon" size={22} />
            <span>{area.title}</span>
            <p>{area.description}</p>
          </Link>
        ))}
      </section>

      <section className="notice-panel">
        <strong>Platform boundary</strong>
        <p>
          No real customer records, quotes, invoices, payments, or job photos should be stored until
          Supabase Auth, database policies, and private storage rules are configured.
        </p>
      </section>
    </main>
  );
}
