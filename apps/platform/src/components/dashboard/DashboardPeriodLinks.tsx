"use client";

import Link, { useLinkStatus } from "next/link";
import { dashboardPeriods, type DashboardPeriod } from "@/lib/dashboard/cash-series";

export function DashboardPeriodLinks({ period }: { period: DashboardPeriod }) {
  return <nav className="dashboard-periods" aria-label="Reporting period">
    {dashboardPeriods.map(item => <Link href={`/admin?range=${item.value}`} key={item.value} prefetch={false} scroll={false}
      title={item.title} aria-label={item.title} aria-current={period === item.value ? "page" : undefined}>
      <PeriodLabel label={item.label} title={item.title} />
    </Link>)}
  </nav>;
}

function PeriodLabel({ label, title }: { label: string; title: string }) {
  const { pending } = useLinkStatus();
  return <span className="dashboard-period-label" data-pending={pending} aria-busy={pending}>
    {label}<span className="sr-only" role="status">{pending ? `Loading ${title.toLowerCase()}…` : ""}</span>
  </span>;
}
