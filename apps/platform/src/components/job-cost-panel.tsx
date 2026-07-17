import { CheckCircle2, CircleDollarSign, FileText, XCircle } from "lucide-react";
import { reviewJobCost } from "@/lib/actions/reporting";
import { JobCostEntryForm } from "@/components/reporting-input-forms";
import type { ReportJobCost } from "@/lib/data/reports";

type CostWithReceipt = ReportJobCost & { receipt_signed_url?: string | null };

export function JobCostPanel({ canManage, costs, jobId }: { canManage: boolean; costs: CostWithReceipt[]; jobId: string }) {
  const approved = costs.filter((cost) => cost.review_status === "approved").reduce((sum, cost) => sum + cost.amount_cents, 0);
  const pending = costs.filter((cost) => cost.review_status === "pending").reduce((sum, cost) => sum + cost.amount_cents, 0);
  return <section className="job-cost-workspace"><div className="job-cost-heading"><div><p className="surface-label"><CircleDollarSign size={17} />Private job costs</p><h2>Direct cost review</h2><p>Costs support estimated profitability and never appear on customer portals, quotes, or invoices.</p></div><dl><div><dt>Approved</dt><dd>{money(approved)}</dd></div><div><dt>Pending</dt><dd>{money(pending)}</dd></div></dl></div><div className="job-cost-layout"><JobCostEntryForm approveByDefault={canManage} jobId={jobId} /><section className="job-cost-list"><h3>Cost history</h3>{costs.length ? costs.map((cost) => <article key={cost.id}><div className="job-cost-record-heading"><div><strong>{cost.description}</strong><span>{title(cost.category)} · {cost.vendor_name || "No vendor"} · {cost.incurred_on}</span></div><b>{money(cost.amount_cents)}</b></div><div className="job-cost-record-meta"><span className={`status-pill ${cost.review_status}`}>{title(cost.review_status)}</span>{cost.receipt_signed_url ? <a href={cost.receipt_signed_url} rel="noreferrer" target="_blank"><FileText size={16} />Receipt</a> : <span>No receipt</span>}</div>{canManage && cost.review_status === "pending" ? <form action={reviewJobCost} className="job-cost-review"><input name="cost_id" type="hidden" value={cost.id} /><input name="job_id" type="hidden" value={jobId} /><input name="review_notes" placeholder="Optional review note" /><button name="decision" type="submit" value="approved"><CheckCircle2 size={16} />Approve</button><button className="reject" name="decision" type="submit" value="rejected"><XCircle size={16} />Reject</button></form> : null}</article>) : <p className="report-empty">No direct costs entered for this work order.</p>}</section></div></section>;
}

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
