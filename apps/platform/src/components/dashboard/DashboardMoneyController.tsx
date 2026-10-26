"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { dashboardPeriods, type DashboardPeriod } from "@/lib/dashboard/cash-series";
import type { DashboardMoney } from "@/lib/data/dashboard-money";
import { decodeDashboardMoney } from "@/lib/dashboard/money-response";
import { DashboardPeriodLinks } from "./DashboardPeriodLinks";
import { DashboardMoneyLoading, DashboardMoneyView } from "./DashboardMoneyView";

const unavailable: DashboardMoney = { kind: "unavailable", start: "", end: "", timezone: "", generatedAt: "", error: "Financial totals could not be confirmed. Open Reports or refresh to try again." };

export function DashboardMoneyController({ period, heading, reportView, children }: { period: DashboardPeriod; heading: string; reportView: "revenue" | "quotes"; children: ReactNode }) {
  const [display, setDisplay] = useState<{ period: DashboardPeriod; result: DashboardMoney | null; pending: boolean }>({ period, result: null, pending: false });
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const select = useCallback(async (next: DashboardPeriod, push = true) => {
    request.current?.abort();
    const controller = new AbortController(), current = ++sequence.current;
    request.current = controller;
    if (push) window.history.pushState(null, "", `/admin?range=${next}`);
    setDisplay({ period: next, result: null, pending: true });
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/admin/dashboard-money?range=${next}`, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw Error("Unavailable");
      const result = decodeDashboardMoney(await response.json());
      if (sequence.current === current) setDisplay({ period: next, result, pending: false });
    } catch {
      if (sequence.current === current) setDisplay({ period: next, result: unavailable, pending: false });
    } finally { clearTimeout(timer); }
  }, []);

  useEffect(() => {
    request.current?.abort();
    sequence.current++;
    setDisplay({ period, result: null, pending: false });
    return () => { sequence.current++; request.current?.abort(); };
  }, [period, children]);

  useEffect(() => {
    const backOrForward = () => {
      if (window.location.pathname !== "/admin") return;
      const value = new URLSearchParams(window.location.search).get("range");
      void select(dashboardPeriods.find(item => item.value === value)?.value ?? "month", false);
    };
    window.addEventListener("popstate", backOrForward);
    return () => window.removeEventListener("popstate", backOrForward);
  }, [select]);

  return <>
    <div className="dashboard-section-heading"><h2 id="dashboard-money-title">{display.result?.kind === "sales" ? "Your sales" : display.result?.kind === "financial" ? "Money overview" : heading}</h2><Link prefetch={false} href={`/admin/reports?view=${display.result?.kind === "sales" ? "quotes" : display.result?.kind === "financial" ? "revenue" : reportView}&range=${display.period}`}>Open reports <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    <DashboardPeriodLinks period={display.period} onSelect={next => { void select(next); }} pendingPeriod={display.pending ? display.period : null} />
    {display.pending ? <DashboardMoneyLoading /> : display.result ? <DashboardMoneyView result={display.result} period={display.period} onRetry={() => { void select(display.period, false); }} /> : children}
  </>;
}
