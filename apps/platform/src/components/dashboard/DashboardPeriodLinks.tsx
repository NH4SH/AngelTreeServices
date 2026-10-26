"use client";

import Link, { useLinkStatus } from "next/link";
import { dashboardPeriods, type DashboardPeriod } from "@/lib/dashboard/cash-series";

export function DashboardPeriodLinks({ period, onSelect, pendingPeriod }: { period: DashboardPeriod; onSelect?: (period: DashboardPeriod) => void; pendingPeriod?: DashboardPeriod | null }) {
  return <nav className="dashboard-periods" aria-label="Reporting period">
    {dashboardPeriods.map(item => <Link href={`/admin?range=${item.value}`} key={item.value} prefetch={false} scroll={false}
      title={item.title} aria-label={item.title} aria-current={period === item.value ? "page" : undefined}
      onClick={onSelect ? event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
        event.preventDefault();
        if (period !== item.value) onSelect(item.value);
      } : undefined}>
      <PeriodLabel label={item.label} title={item.title} forcedPending={onSelect ? pendingPeriod === item.value : undefined} />
    </Link>)}
  </nav>;
}

function PeriodLabel({ label, title, forcedPending }: { label: string; title: string; forcedPending?: boolean }) {
  const linkStatus = useLinkStatus();
  const pending = forcedPending ?? linkStatus.pending;
  return <span className="dashboard-period-label" data-pending={pending} aria-busy={pending}>
    {label}<span className="sr-only" role="status">{pending ? `Loading ${title.toLowerCase()}…` : ""}</span>
  </span>;
}
