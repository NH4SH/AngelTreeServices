"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import { AlertTriangle, CalendarPlus, Gauge, Save, ShieldCheck, Truck, Wrench } from "lucide-react";
import { equipmentInspectionTemplates } from "@/lib/equipment/inspection-templates";
import type { AssignableUser, EquipmentAsset } from "@/lib/types/database";
import {
  addEquipmentReading,
  addMaintenanceSchedule,
  assignEquipment,
  changeEquipmentStatus,
  createEquipmentAsset,
  updateEquipmentAsset,
  uploadEquipmentDocument,
  type EquipmentActionState,
} from "./actions";

const equipmentInitialState: EquipmentActionState = { status: "idle", message: "" };

const categories = ["vehicle", "chipper", "stump_grinder", "skid_steer", "crane", "aerial_lift", "trailer", "chainsaw", "climbing_gear", "rigging_gear", "ppe", "landscaping_equipment", "lawn_care_equipment", "other"];

export function EquipmentAssetForm({ asset, canSeeCosts, purchasePriceCents }: { asset?: EquipmentAsset; canSeeCosts: boolean; purchasePriceCents?: number | null }) {
  const action = asset ? updateEquipmentAsset : createEquipmentAsset;
  const [state, formAction, pending] = useReliableActionState(action, equipmentInitialState);
  return (
    <form action={formAction} className="crm-form equipment-form">
      {asset ? <input name="asset_id" type="hidden" value={asset.id} /> : null}
      <FormMessage state={state} />
      <fieldset className="nested-fieldset">
        <legend>Equipment identity</legend>
        <div className="form-grid-two">
          <label>Asset number<input defaultValue={asset?.asset_number ?? ""} name="asset_number" placeholder="ATS-TRK-01" required /></label>
          <label>Equipment name<input defaultValue={asset?.name ?? ""} name="name" placeholder="Bucket truck 1" required /></label>
        </div>
        <div className="form-grid-two">
          <label>Category<select defaultValue={asset?.category ?? "vehicle"} name="category">{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label>Model year<input defaultValue={asset?.model_year ?? ""} inputMode="numeric" name="model_year" placeholder="2022" /></label>
        </div>
        <div className="form-grid-two">
          <label>Manufacturer<input defaultValue={asset?.manufacturer ?? ""} name="manufacturer" /></label>
          <label>Model<input defaultValue={asset?.model ?? ""} name="model" /></label>
        </div>
        <div className="form-grid-three">
          <label>Serial number<input defaultValue={asset?.serial_number ?? ""} name="serial_number" /></label>
          <label>VIN<input defaultValue={asset?.vin ?? ""} name="vin" /></label>
          <label>License plate<input defaultValue={asset?.license_plate ?? ""} name="license_plate" /></label>
        </div>
      </fieldset>
      <fieldset className="nested-fieldset">
        <legend>Ownership and location</legend>
        <div className="form-grid-three">
          <label>Ownership<select defaultValue={asset?.ownership_type ?? "owned"} name="ownership_type"><option value="owned">Owned</option><option value="leased">Leased</option><option value="rented">Rented</option><option value="other">Other</option></select></label>
          <label>Purchase date<input defaultValue={asset?.purchase_date ?? ""} name="purchase_date" type="date" /></label>
          <label>Current location<input defaultValue={asset?.location_label ?? ""} name="location_label" placeholder="Main shop" /></label>
        </div>
        {canSeeCosts ? <label>Purchase price<input defaultValue={purchasePriceCents == null ? "" : (purchasePriceCents / 100).toFixed(2)} min="0" name="purchase_price" step="0.01" type="number" /></label> : null}
      </fieldset>
      <fieldset className="nested-fieldset">
        <legend>Safety and inspections</legend>
        <div className="form-grid-two">
          <label>Safety class<input defaultValue={asset?.safety_class ?? ""} name="safety_class" placeholder="CDL, aerial, saw, PPE" /></label>
          <label>Inspection checklist<select defaultValue={asset?.inspection_template_key ?? ""} name="inspection_template_key"><option value="">No fixed checklist</option>{equipmentInspectionTemplates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select></label>
        </div>
        <label>Required PPE<textarea defaultValue={asset?.ppe_required ?? ""} name="ppe_required" placeholder="Helmet, eye and hearing protection, chaps..." rows={2} /></label>
        <label>Inspection interval (days)<input defaultValue={asset?.inspection_interval_days ?? ""} min="1" name="inspection_interval_days" type="number" /></label>
      </fieldset>
      <label>Administrative notes<textarea defaultValue={asset?.admin_notes ?? ""} name="admin_notes" placeholder="Office-only fleet notes" rows={4} /></label>
      {state.status === "warning" ? <label className="checkbox-field"><input name="duplicate_override" type="checkbox" />I confirmed this is a separate asset. Save anyway.</label> : null}
      <div className="action-row equipment-form-actions">
        <button disabled={pending} type="submit"><Save size={18} />{pending ? "Saving..." : asset ? "Save changes" : "Add equipment"}</button>
        <Link className="secondary-action" href={asset ? `/admin/equipment/${asset.id}` : "/admin/equipment"}>Cancel</Link>
      </div>
    </form>
  );
}

export function ReadingForm({ asset }: { asset: EquipmentAsset }) {
  const [state, action, pending] = useReliableActionState(addEquipmentReading, equipmentInitialState);
  return <form action={action} className="crm-form compact-equipment-form">
    <input name="asset_id" type="hidden" value={asset.id} /><FormMessage state={state} />
    <div className="form-grid-two"><label>Reading type<select name="reading_type"><option value="mileage">Mileage</option><option value="hours">Engine hours</option></select></label><label>Current reading<input min="0" name="reading_value" required step="0.1" type="number" /></label></div>
    <label>Correction reason<textarea name="correction_reason" placeholder="Required only when correcting to a lower reading" rows={2} /></label>
    {state.status === "warning" ? <label className="checkbox-field"><input name="confirm_correction" type="checkbox" />Record this as a correction and keep the previous reading.</label> : null}
    <button disabled={pending} type="submit"><Gauge size={18} />{pending ? "Adding..." : "Add reading"}</button>
  </form>;
}

export function AssignmentForm({ asset, users, jobs, events, canOverride }: { asset: EquipmentAsset; users: AssignableUser[]; jobs: { id: string; service_type: string | null; status: string }[]; events: { id: string; title: string; starts_at: string; ends_at: string | null }[]; canOverride: boolean }) {
  const [state, action, pending] = useReliableActionState(assignEquipment, equipmentInitialState);
  return <form action={action} className="crm-form compact-equipment-form"><input name="asset_id" type="hidden" value={asset.id} /><FormMessage state={state} />
    <label>Employee<select name="assigned_user_id"><option value="">Choose employee</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label>
    <div className="form-grid-two"><label>Work order<select name="job_id"><option value="">No linked work order</option>{jobs.map((job) => <option key={job.id} value={job.id}>{label(job.service_type ?? "work")} - {job.status.replaceAll("_", " ")}</option>)}</select></label><label>Schedule event<select name="schedule_event_id"><option value="">No linked event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title} - {formatDate(event.starts_at)}</option>)}</select></label></div>
    <div className="form-grid-two"><label>Starts<input name="starts_at" required type="datetime-local" /></label><label>Ends<input name="ends_at" type="datetime-local" /></label></div>
    <label>Assignment notes<textarea name="notes" placeholder="Attachments, trailer pairing, delivery notes" rows={2} /></label>
    {canOverride ? <label>Owner/admin override reason<textarea name="conflict_override_reason" placeholder="Only use when deliberately overriding a conflict, overdue item, or blocked status" rows={2} /></label> : null}
    <button disabled={pending} type="submit"><Truck size={18} />{pending ? "Assigning..." : "Assign equipment"}</button>
  </form>;
}

export function MaintenanceScheduleForm({ assetId }: { assetId: string }) {
  const [state, action, pending] = useReliableActionState(addMaintenanceSchedule, equipmentInitialState);
  return <form action={action} className="crm-form compact-equipment-form"><input name="asset_id" type="hidden" value={assetId} /><FormMessage state={state} />
    <div className="form-grid-two"><label>Maintenance item<input name="title" placeholder="Oil and filter service" required /></label><label>Type<select name="maintenance_type"><option value="preventive">Preventive</option><option value="inspection">Inspection</option><option value="repair">Repair</option><option value="registration">Registration</option><option value="other">Other</option></select></label></div>
    <div className="form-grid-three"><label>Every days<input min="1" name="interval_days" type="number" /></label><label>Every miles<input min="1" name="interval_miles" step="0.1" type="number" /></label><label>Every hours<input min="1" name="interval_hours" step="0.1" type="number" /></label></div>
    <div className="form-grid-three"><label>Next date<input name="next_due_at" type="datetime-local" /></label><label>Next mileage<input min="0" name="next_due_mileage" step="0.1" type="number" /></label><label>Next hours<input min="0" name="next_due_hours" step="0.1" type="number" /></label></div>
    <label>Instructions<textarea name="instructions" rows={2} /></label><button disabled={pending} type="submit"><CalendarPlus size={18} />{pending ? "Adding..." : "Add maintenance schedule"}</button>
  </form>;
}

export function EquipmentStatusForm({ asset }: { asset: EquipmentAsset }) {
  const [state, action, pending] = useReliableActionState(changeEquipmentStatus, equipmentInitialState);
  return <form action={action} className="crm-form compact-equipment-form"><input name="asset_id" type="hidden" value={asset.id} /><FormMessage state={state} />
    <label>New status<select defaultValue={asset.status} name="next_status"><option value="available">Available / return to service</option><option value="maintenance_due">Maintenance due</option><option value="out_of_service">Out of service</option><option value="awaiting_parts">Awaiting parts</option><option value="repair_scheduled">Repair scheduled</option><option value="retired">Retired</option></select></label>
    <label>Reason<textarea name="reason" placeholder="Required for out-of-service and return-to-service changes" rows={2} /></label>
    <button disabled={pending} type="submit">{asset.status === "out_of_service" ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}{pending ? "Updating..." : "Update status"}</button>
  </form>;
}

export function EquipmentDocumentForm({ assetId }: { assetId: string }) {
  const [state, action, pending] = useReliableActionState(uploadEquipmentDocument, equipmentInitialState);
  return <form action={action} className="crm-form compact-equipment-form"><input name="asset_id" type="hidden" value={assetId} /><FormMessage state={state} />
    <div className="form-grid-two"><label>Document title<input name="title" placeholder="2026 registration" required /></label><label>Document type<select name="document_type"><option value="registration">Registration</option><option value="insurance">Insurance</option><option value="inspection">Inspection certificate</option><option value="manual">Manual</option><option value="warranty">Warranty</option><option value="receipt">Receipt</option><option value="photo">Photo</option><option value="other">Other</option></select></label></div>
    <label>Expiration, if applicable<input name="expires_at" type="datetime-local" /></label><label>Private file<input accept="application/pdf,image/jpeg,image/png,image/webp" name="file" required type="file" /></label>
    <button disabled={pending} type="submit"><Save size={18} />{pending ? "Uploading..." : "Upload private document"}</button>
  </form>;
}

function FormMessage({ state }: { state: EquipmentActionState }) { return state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
