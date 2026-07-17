import Link from "next/link";
import { AlertTriangle, ClipboardCheck, ShieldCheck, Truck } from "lucide-react";
import { CrewInspectionForm, CrewProblemForm } from "../CrewEquipmentForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getMyAssignedEquipment } from "@/lib/data/equipment";

type Props = { params: Promise<{ assetId: string }>; searchParams: Promise<{ assignment?: string }> };
export default async function CrewEquipmentDetailPage({ params, searchParams }: Props) {
  const { assetId } = await params; const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/crew/equipment/${assetId}`);
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening assigned equipment" />;
  const result = await getMyAssignedEquipment();
  const assignment = result.data.find((item) => item.asset_id === assetId && (!query.assignment || item.assignment_id === query.assignment));
  return <PlatformFrame active="crew-equipment" roles={context.roles} userEmail={context.user.email}><div className="crew-shell app-content"><Link className="crew-back-link" href="/crew/equipment">Back to assigned equipment</Link>{result.error ? <section className="data-warning"><strong>Equipment unavailable</strong><p>{result.error}</p></section> : null}{!assignment ? <section className="crew-panel"><h1>Equipment unavailable</h1><p>This asset is not currently assigned to your account.</p></section> : <>
    <section className="crew-hero"><p className="surface-label"><Truck size={18} />{assignment.asset_number}</p><h1>{assignment.asset_name}</h1><p>{[assignment.manufacturer, assignment.model].filter(Boolean).join(" ") || assignment.category.replaceAll("_", " ")}</p><span className={`equipment-status status-${assignment.status}`}>{assignment.status.replaceAll("_", " ")}</span></section>
    {assignment.status === "out_of_service" ? <section className="crew-equipment-safety-alert"><AlertTriangle size={26} /><div><strong>Do not use this equipment</strong><p>It is out of service. Contact your supervisor for a replacement assignment.</p></div></section> : <section className="crew-equipment-ready"><ShieldCheck size={24} /><div><strong>Inspect before use</strong><p>A failed item automatically takes equipment out of service.</p></div></section>}
    <section className="crew-panel"><div className="crew-panel-heading"><span className="crew-panel-icon"><ClipboardCheck size={20} /></span><div><h2>Pre-use inspection</h2><p>Check every line. Select Fail for any condition that makes operation unsafe.</p></div></div><CrewInspectionForm assignment={assignment} /></section>
    <section className="crew-panel crew-problem-panel"><div className="crew-panel-heading"><span className="crew-panel-icon"><AlertTriangle size={20} /></span><div><h2>Report a problem</h2><p>Use this any time equipment is damaged, unsafe, leaking, broken, or not working normally.</p></div></div><CrewProblemForm assignment={assignment} /></section>
  </>}</div></PlatformFrame>;
}
