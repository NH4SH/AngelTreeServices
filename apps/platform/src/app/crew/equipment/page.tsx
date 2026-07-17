import Link from "next/link";
import { AlertTriangle, ClipboardCheck, ShieldCheck, Truck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getMyAssignedEquipment } from "@/lib/data/equipment";

export default async function CrewEquipmentPage() {
  const context = await getAuthenticatedPlatformContext("/crew/equipment");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening assigned equipment" />;
  const assignments = await getMyAssignedEquipment();
  return <PlatformFrame active="crew-equipment" roles={context.roles} userEmail={context.user.email}><div className="crew-shell app-content">
    <section className="crew-hero"><p className="surface-label"><Truck size={18} />Crew equipment</p><h1>Assigned equipment</h1><p>Check equipment before use. Stop and report anything unsafe.</p></section>
    {assignments.error ? <section className="data-warning"><strong>Equipment unavailable</strong><p>{assignments.error}</p></section> : null}
    {assignments.data.length ? <section className="crew-equipment-list">{assignments.data.map((assignment) => <article className={`crew-equipment-card status-${assignment.status}`} key={assignment.assignment_id}><div className="crew-equipment-card-heading"><span className="crew-panel-icon"><Truck size={21} /></span><div><p>{assignment.asset_number}</p><h2>{assignment.asset_name}</h2><span>{[assignment.manufacturer, assignment.model].filter(Boolean).join(" ") || assignment.category.replaceAll("_", " ")}</span></div></div><span className={`equipment-status status-${assignment.status}`}>{assignment.status.replaceAll("_", " ")}</span>{assignment.status === "out_of_service" ? <div className="crew-equipment-stop"><AlertTriangle size={20} /><strong>Do not use this equipment.</strong></div> : null}<dl className="crew-detail-list"><div><dt>Assignment</dt><dd>{formatDate(assignment.starts_at)}{assignment.ends_at ? ` to ${formatDate(assignment.ends_at)}` : " onward"}</dd></div><div><dt>Required PPE</dt><dd>{assignment.ppe_required || "Follow standard job PPE requirements"}</dd></div></dl><Link className="primary-action" href={`/crew/equipment/${assignment.asset_id}?assignment=${assignment.assignment_id}`}><ClipboardCheck size={19} />Inspect or report problem</Link></article>)}</section> : <section className="crew-panel"><div className="crew-panel-heading"><span className="crew-panel-icon"><ShieldCheck size={20} /></span><div><h2>No equipment assigned</h2><p>Equipment assigned to you for today or the next two weeks will appear here.</p></div></div></section>}
  </div></PlatformFrame>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
