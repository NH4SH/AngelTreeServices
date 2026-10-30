import Link from "next/link";
import { getCompletedEstimatesWithoutProposal } from "@/lib/data/next-actions";
import { formatBusinessDateTime, getBusinessDateKey } from "@/lib/business-time";

export async function CompletedEstimatesPanel() {
  const result = await getCompletedEstimatesWithoutProposal();
  return <section className="panel dashboard-panel">
    <h2>Estimate follow-through</h2>
    <p className="subtle-empty">Completed estimates with no linked proposal in the latest 100 records.</p>
    {result.error ? <p role="status">{result.error}</p> : null}
    <div className="workflow-list">{result.data.slice(0, 10).map(event => <Link className="workflow-row" key={event.id} href={`/admin/schedule?date=${getBusinessDateKey(event.starts_at)}&event=${event.id}`}><span><strong>{event.title}</strong><small>{formatBusinessDateTime(event.starts_at)} · Review scope and prepare proposal</small></span></Link>)}</div>
    {!result.error && !result.data.length ? <p className="subtle-empty">No unlinked completed estimates in this preview.</p> : null}
    <Link href="/admin/schedule?event_type=estimate&status=completed">Review completed estimates</Link>
  </section>;
}
