import Link from "next/link";
import { getNextActions, getNextActionStaff } from "@/lib/data/next-actions";
import { nextActionDue, nextActionHref, type NextActionSubject } from "@/lib/next-actions";
import { formatBusinessDateTime } from "@/lib/business-time";
import { NextActionForm } from "@/components/NextActionForm";
import { FollowUpActions } from "@/components/recurring-forms";

export async function NextActionsPanel({ subject, id, dueOnly = false }: { subject?: NextActionSubject; id?: string; dueOnly?: boolean }) {
  const [tasks, staff] = await Promise.all([getNextActions(subject, id, undefined, dueOnly), subject ? getNextActionStaff() : Promise.resolve([])]);
  const visible = tasks.data.filter(task => !dueOnly || nextActionDue(task) <= Date.now()).sort((a, b) => nextActionDue(a) - nextActionDue(b));
  return <section className="panel next-actions-panel" aria-label="Office next actions">
    <header><h2>{dueOnly ? "Due handoffs" : "Next actions"}</h2><Link href="/admin/follow-ups?assigned=me">My follow-ups</Link></header>
    {tasks.error ? <p role="status">{tasks.error}</p> : null}
    {visible.slice(0, 10).map(task => <article className="next-action-item" key={task.id}>
      <Link href={nextActionHref(task)}><strong>{task.title}</strong></Link>
      <p>{task.description}</p>
      <small>{task.assigned_profile?.full_name || task.assigned_profile?.email || "Shared office queue"} · {formatBusinessDateTime(task.snoozed_until ?? task.due_at)} · {task.status.replaceAll("_", " ")}</small>
      <FollowUpActions taskId={task.id} status={task.status} />
    </article>)}
    {!visible.length && !tasks.error ? <p className="subtle-empty">{dueOnly ? "No due handoffs in the loaded queue." : "No open next action on this record."}</p> : null}
    <Link href="/admin/follow-ups">View all follow-ups</Link>
    {subject && id ? <details><summary>Add next action</summary><NextActionForm subject={subject} id={id} staff={staff} /></details> : null}
  </section>;
}
