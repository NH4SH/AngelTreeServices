"use client";

import { useActionState } from "react";
import { AlertTriangle, Camera, ClipboardCheck } from "lucide-react";
import { getInspectionTemplate } from "@/lib/equipment/inspection-templates";
import type { CrewEquipmentAssignment } from "@/lib/types/database";
import { reportEquipmentProblem, submitEquipmentInspection, type CrewEquipmentActionState } from "./actions";

const crewEquipmentInitialState: CrewEquipmentActionState = { status: "idle", message: "" };

export function CrewInspectionForm({ assignment }: { assignment: CrewEquipmentAssignment }) {
  const [state, action, pending] = useActionState(submitEquipmentInspection, crewEquipmentInitialState);
  const template = getInspectionTemplate(assignment.inspection_template_key);
  if (!template) return <section className="crew-empty-inline"><strong>No fixed checklist is assigned.</strong><p>Ask the office to attach the correct inspection checklist before operating equipment that requires one.</p></section>;
  return <form action={action} className="crew-equipment-form"><input name="asset_id" type="hidden" value={assignment.asset_id} /><input name="assignment_id" type="hidden" value={assignment.assignment_id} /><input name="template_key" type="hidden" value={template.key} /><Message state={state} />
    <div className="crew-inspection-list">{template.items.map((item) => <fieldset className="crew-inspection-item" key={item.key}><legend>{item.label}{item.critical ? <span>Safety critical</span> : null}</legend><div className="crew-inspection-options"><label><input name={`item_${item.key}`} required type="radio" value="pass" />Pass</label><label><input name={`item_${item.key}`} required type="radio" value="attention" />Needs attention</label><label><input name={`item_${item.key}`} required type="radio" value="fail" />Fail</label></div></fieldset>)}</div>
    <div className="form-grid-two"><label>Mileage, if shown<input inputMode="decimal" min="0" name="mileage" step="0.1" type="number" /></label><label>Engine hours, if shown<input inputMode="decimal" min="0" name="hours" step="0.1" type="number" /></label></div>
    <label>Inspection notes<textarea name="notes" placeholder="Required for anything that needs attention or fails" rows={4} /></label><button disabled={pending} type="submit"><ClipboardCheck size={20} />{pending ? "Submitting inspection..." : "Submit inspection"}</button>
  </form>;
}

export function CrewProblemForm({ assignment }: { assignment: CrewEquipmentAssignment }) {
  const [state, action, pending] = useActionState(reportEquipmentProblem, crewEquipmentInitialState);
  return <form action={action} className="crew-equipment-form"><input name="asset_id" type="hidden" value={assignment.asset_id} /><input name="assignment_id" type="hidden" value={assignment.assignment_id} /><Message state={state} />
    <label>What is wrong?<input name="title" placeholder="Hydraulic leak, damaged tire, chain brake..." required /></label><label>What did you see or hear?<textarea name="description" placeholder="Describe where the problem is and what happened. Do not troubleshoot while equipment is running." required rows={5} /></label>
    <label>Severity<select defaultValue="attention" name="severity"><option value="attention">Needs attention, equipment can be parked safely</option><option value="unsafe">Unsafe, do not use</option><option value="critical">Critical hazard or breakdown</option></select></label>
    <label className="checkbox-field crew-stop-checkbox"><input name="equipment_stopped" type="checkbox" /><span><strong>I stopped using this equipment</strong><small>Check this for a breakdown, unsafe condition, or any problem that should block assignment.</small></span></label>
    <label><span className="file-label"><Camera size={18} />Problem photo (optional)</span><input accept="image/jpeg,image/png,image/webp" capture="environment" name="photo" type="file" /></label>
    <button className="crew-danger-action" disabled={pending} type="submit"><AlertTriangle size={20} />{pending ? "Sending report..." : "Report equipment problem"}</button>
  </form>;
}

function Message({ state }: { state: CrewEquipmentActionState }) { return state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null; }
