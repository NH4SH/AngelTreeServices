"use client";

import { useId, useState } from "react";
import { cashCurrency, cashDate, type CashPoint } from "@/lib/dashboard/cash-series";

export function DashboardCashChart({ points }: { points: CashPoint[] }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const last = points.at(-1);
  if (!last) return null;
  const total = last.cumulativeCents;
  const max = Math.max(total, 1);
  const start = Date.parse(points[0].start);
  const elapsed = Date.parse(last.end) + 86_400_000 - start;
  const x = (i: number) => 24 + (i === 0 ? 0 : (Date.parse(points[i - 1].end) + 86_400_000 - start) / elapsed) * 672;
  const y = (cents: number) => 198 - (cents / max) * 168;
  const path = `M ${x(0)} ${y(0)} ` + points.map((p, i) => `L ${x(i + 1)} ${y(p.cumulativeCents)}`).join(" ");
  const selected = active === null ? null : points[active];
  return <div className="cash-chart">
    <div className="cash-chart-caption" aria-live="polite" aria-atomic="true">
      {selected ? <><span>{cashDate(selected.start)}–{cashDate(selected.end)}</span><strong>{cashCurrency(selected.cents)} received</strong><span>{cashCurrency(selected.cumulativeCents)} cumulative</span></> : <><span>Cumulative cash collected</span><span>{total === 0 ? "No retained payments in this period" : "Select a point for the exact amount"}</span></>}
    </div>
    <svg viewBox="0 0 720 230" preserveAspectRatio="none" role="group" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Cash collected over the selected period</title>
      <desc id={`${id}-desc`}>{cashCurrency(total)} total, from {cashDate(points[0].start)} to {cashDate(last.end)}. This is retained payment principal, not profit. Exact values are available in the table below.</desc>
      {[30, 114, 198].map(level => <line className="cash-chart-grid" x1="24" x2="696" y1={level} y2={level} key={level} />)}
      <path className="cash-chart-line" d={path} />
      {active !== null ? <line className="cash-chart-cursor" x1={x(active + 1)} x2={x(active + 1)} y1="20" y2="205" /> : null}
      {points.map((point, i) => <g key={point.end}>
        <circle className="cash-chart-dot" cx={x(i + 1)} cy={y(point.cumulativeCents)} r={active === i ? 5 : 3} />
        <rect role="button" tabIndex={0} aria-label={`${cashDate(point.start)} to ${cashDate(point.end)}: ${cashCurrency(point.cents)} received; ${cashCurrency(point.cumulativeCents)} cumulative`} aria-pressed={active === i}
          className="cash-chart-hit" x={x(i + 1) - 45} y="6" width="90" height="212"
          onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(i); }
            if (event.key === "Escape") setActive(null);
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              const target = event.currentTarget.closest("svg")?.querySelectorAll<SVGRectElement>("[role=button]");
              target?.[Math.max(0, Math.min(points.length - 1, i + (event.key === "ArrowRight" ? 1 : -1)))]?.focus();
            }
          }} />
      </g>)}
    </svg>
    <div className="cash-chart-axis"><span>{cashDate(points[0].start)}</span><span>{cashDate(last.end)}</span></div>
    <details className="cash-chart-table"><summary>Exact amounts</summary><div className="dashboard-table-wrap"><table><caption>Cash received by period</caption><thead><tr><th scope="col">Dates</th><th scope="col">Received</th><th scope="col">Cumulative</th></tr></thead><tbody>{points.map(p => <tr key={p.end}><th scope="row">{cashDate(p.start)}–{cashDate(p.end)}</th><td>{cashCurrency(p.cents)}</td><td>{cashCurrency(p.cumulativeCents)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
