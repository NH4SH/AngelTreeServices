"use client";

import { useActionState, useEffect, useState } from "react";
import { ArchiveRestore, Factory, MapPinned, PackageCheck, ReceiptText, RotateCcw, Save, Truck } from "lucide-react";
import {
  addJobMaterialRequirement,
  createInventoryLocation,
  createMaterial,
  updateMaterial,
  recordCustomerDelivery,
  recordDisposal,
  recordInventoryMovement,
  recordMaterialPurchase,
  recordProductionBatch,
  recordStockpileMeasurement,
  releaseMaterialReservation,
  reserveMaterial,
  reverseInventoryTransaction,
  reviewInventoryTransactionCost,
  type MaterialActionState,
} from "@/lib/actions/materials";
import {
  crewInventoryTransactionTypes,
  disposalDestinationTypes,
  inventoryLocationTypes,
  inventoryTransactionTypes,
  materialCategories,
  materialLabel,
  materialUnits,
} from "@/lib/materials/definitions";
import type { InventoryLocationRecord, MaterialRecord } from "@/lib/data/materials";

const initialState: MaterialActionState = { status: "idle", message: "" };
type BasicOption = { id: string; name?: string; display_name?: string; service_type?: string | null; status?: string; asset_number?: string };

export function MaterialCatalogForm({ canViewCosts, internalCostCents, material, organizations }: { canViewCosts: boolean; internalCostCents?: number | null; material?: MaterialRecord; organizations: BasicOption[] }) {
  const [state, action, pending] = useActionState(material ? updateMaterial : createMaterial, initialState);
  return <form action={action} className="crm-form material-form"><FormMessage state={state} />
    {material ? <input name="material_id" type="hidden" value={material.id} /> : null}
    <div className="form-grid-two"><label>Material name<input defaultValue={material?.name ?? ""} name="name" placeholder="Brown dyed mulch" required /></label><label>Category<select defaultValue={material?.category ?? "mulch"} name="category">{materialCategories.map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label></div>
    <div className="form-grid-three"><label>SKU<input defaultValue={material?.sku ?? ""} name="sku" placeholder="MULCH-BROWN" /></label><label>Default unit<select defaultValue={material?.default_unit ?? "each"} name="default_unit">{materialUnits.map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label><label>Reorder threshold<input defaultValue={material?.reorder_threshold ?? ""} min="0" name="reorder_threshold" step="0.001" type="number" /></label></div>
    <label>Description<textarea defaultValue={material?.description ?? ""} name="description" rows={3} /></label>
    <div className="form-grid-two"><label>Default customer price<input defaultValue={material?.default_price_cents == null ? "" : (material.default_price_cents / 100).toFixed(2)} min="0" name="default_price" step="0.01" type="number" /></label>{canViewCosts ? <label>Internal unit cost<input defaultValue={internalCostCents == null ? "" : (internalCostCents / 100).toFixed(2)} min="0" name="internal_unit_cost" step="0.01" type="number" /></label> : null}</div>
    <label>Preferred vendor<select defaultValue={material?.preferred_vendor_organization_id ?? ""} name="preferred_vendor_organization_id"><option value="">Not selected</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <div className="material-check-row"><label className="checkbox-field"><input defaultChecked={material?.stock_tracked ?? true} name="stock_tracked" type="checkbox" />Track stock</label><label className="checkbox-field"><input defaultChecked={material?.is_billable ?? false} name="is_billable" type="checkbox" />Billable to customer</label></div>
    <label>Internal notes<textarea defaultValue={material?.notes ?? ""} name="notes" rows={2} /></label>
    <div className="action-row"><button disabled={pending} name="intent" type="submit" value="save"><Save size={18} />{pending ? "Saving..." : material ? "Save changes" : "Add material"}</button>{material ? <button className="secondary-action danger-action" disabled={pending} name="intent" type="submit" value="archive">Archive</button> : null}</div>
  </form>;
}

export function InventoryLocationForm({ equipment }: { equipment: BasicOption[] }) {
  const [state, action, pending] = useActionState(createInventoryLocation, initialState);
  return <form action={action} className="crm-form material-form"><FormMessage state={state} />
    <div className="form-grid-two"><label>Location name<input name="name" placeholder="Main yard" required /></label><label>Location type<select name="location_type">{inventoryLocationTypes.map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label></div>
    <label>Linked truck or trailer<select name="equipment_asset_id"><option value="">No linked equipment</option>{equipment.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_number} - {asset.name}</option>)}</select></label>
    <label>Address<input name="address" /></label><label>Notes<textarea name="notes" rows={2} /></label>
    <button disabled={pending} type="submit"><MapPinned size={18} />{pending ? "Adding..." : "Add location"}</button>
  </form>;
}

export function InventoryMovementForm({ equipment, jobs, locations, materials }: { equipment: BasicOption[]; jobs: BasicOption[]; locations: InventoryLocationRecord[]; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(recordInventoryMovement, initialState);
  return <form action={action} className="crm-form material-form" encType="multipart/form-data"><IdempotencyInput /><FormMessage state={state} />
    <div className="form-grid-three"><label>Movement<select name="transaction_type">{inventoryTransactionTypes.filter((value) => !["reserve", "release", "reversal"].includes(value)).map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label><MaterialSelect materials={materials} /><UnitSelect /></div>
    <div className="form-grid-three"><label>Quantity<input min="0.001" name="quantity" required step="0.001" type="number" /></label><LocationSelect label="From location" locations={locations} name="source_location_id" /><LocationSelect label="To location" locations={locations} name="destination_location_id" /></div>
    <div className="form-grid-two"><JobSelect jobs={jobs} /><label>Truck / equipment<select name="equipment_asset_id"><option value="">Not linked</option>{equipment.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_number} - {asset.name}</option>)}</select></label></div>
    <div className="form-grid-two"><label>Date and time<input name="occurred_at" type="datetime-local" /></label><label>Private photo or receipt<input accept="application/pdf,image/jpeg,image/png,image/webp" name="attachment" type="file" /></label></div>
    <label>Notes<textarea name="notes" rows={2} /></label><label>Authorized negative-stock override reason<input name="negative_override_reason" placeholder="Required only for a deliberate owner/admin override" /></label>
    <label className="checkbox-field"><input name="is_estimated" type="checkbox" />Quantity is estimated</label>
    <button disabled={pending} type="submit"><Truck size={18} />{pending ? "Recording..." : "Record movement"}</button>
  </form>;
}

export function JobMaterialPlanForm({ jobId, materials }: { jobId: string; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(addJobMaterialRequirement, initialState);
  return <form action={action} className="crm-form compact-material-form"><input name="job_id" type="hidden" value={jobId} /><FormMessage state={state} />
    <div className="form-grid-three"><MaterialSelect materials={materials} /><label>Planned quantity<input min="0.001" name="quantity" required step="0.001" type="number" /></label><UnitSelect /></div>
    <label>Loading or use notes<textarea name="notes" rows={2} /></label><label className="checkbox-field"><input name="is_estimated" type="checkbox" />Planned quantity is estimated</label>
    <button disabled={pending} type="submit"><PackageCheck size={18} />{pending ? "Adding..." : "Add planned material"}</button>
  </form>;
}

export function ReservationForm({ jobs, locations, materials }: { jobs: BasicOption[]; locations: InventoryLocationRecord[]; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(reserveMaterial, initialState);
  return <form action={action} className="crm-form material-form"><FormMessage state={state} />
    <div className="form-grid-two"><JobSelect jobs={jobs} /><MaterialSelect materials={materials} /></div>
    <div className="form-grid-three"><LocationSelect label="Reserve from" locations={locations} name="location_id" required /><label>Quantity<input min="0.001" name="quantity" required step="0.001" type="number" /></label><UnitSelect /></div>
    <label>Expected supply date, if short<input name="expected_available_at" type="datetime-local" /></label><label>Shortage override reason<input name="shortage_override_reason" placeholder="Owner/admin reason when reserving more than available" /></label>
    <button disabled={pending} type="submit"><ArchiveRestore size={18} />{pending ? "Reserving..." : "Reserve material"}</button>
  </form>;
}

export function ReleaseReservationForm({ reservationId }: { reservationId: string }) {
  const [state, action, pending] = useActionState(releaseMaterialReservation, initialState);
  return <form action={action} className="inline-material-action"><input name="reservation_id" type="hidden" value={reservationId} /><input aria-label="Release reason" name="reason" placeholder="Release reason" required /><button className="secondary-action" disabled={pending} type="submit">{pending ? "Releasing..." : "Release"}</button><FormMessage state={state} /></form>;
}

export function PurchaseForm({ locations, materials, organizations }: { locations: InventoryLocationRecord[]; materials: MaterialRecord[]; organizations: BasicOption[] }) {
  const [state, action, pending] = useActionState(recordMaterialPurchase, initialState);
  return <form action={action} className="crm-form material-form" encType="multipart/form-data"><IdempotencyInput /><FormMessage state={state} />
    <div className="form-grid-two"><MaterialSelect materials={materials} /><LocationSelect label="Received at" locations={locations} name="received_location_id" required /></div>
    <div className="form-grid-three"><label>Quantity<input min="0.001" name="quantity" required step="0.001" type="number" /></label><UnitSelect /><label>Unit cost<input min="0" name="unit_cost" required step="0.01" type="number" /></label></div>
    <div className="form-grid-three"><label>Purchase date<input defaultValue={new Date().toISOString().slice(0, 10)} name="purchase_date" type="date" /></label><label>Taxes / fees<input min="0" name="taxes_fees" step="0.01" type="number" /></label><label>Delivery charge<input min="0" name="delivery_charge" step="0.01" type="number" /></label></div>
    <label>Vendor<select name="vendor_organization_id"><option value="">Use typed vendor</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <div className="form-grid-two"><label>Vendor name<input name="vendor_name" /></label><label>PO / reference<input name="purchase_order_reference" /></label></div>
    <label>Private receipt<input accept="application/pdf,image/jpeg,image/png,image/webp" name="receipt" type="file" /></label><label>Notes<textarea name="notes" rows={2} /></label>
    <button disabled={pending} type="submit"><ReceiptText size={18} />{pending ? "Receiving..." : "Record purchase and receive"}</button>
  </form>;
}

export function DisposalForm({ equipment, jobs, locations, materials, showCosts = true }: { equipment: BasicOption[]; jobs: BasicOption[]; locations: InventoryLocationRecord[]; materials: MaterialRecord[]; showCosts?: boolean }) {
  const [state, action, pending] = useActionState(recordDisposal, initialState);
  return <form action={action} className="crm-form material-form" encType="multipart/form-data"><IdempotencyInput /><FormMessage state={state} />
    <div className="form-grid-two"><JobSelect jobs={jobs} required /><label>Destination type<select name="destination_type">{disposalDestinationTypes.map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label></div>
    <label>Destination / facility name<input name="destination_name" placeholder="Regional landfill or donation site" required /></label>
    <div className="form-grid-three"><MaterialSelect materials={materials} optional /><label>Quantity<input min="0.001" name="quantity" step="0.001" type="number" /></label><UnitSelect optional /></div>
    <div className="form-grid-three"><LocationSelect label="Loaded from" locations={locations} name="source_location_id" /><EquipmentSelect equipment={equipment} label="Vehicle" name="vehicle_asset_id" /><EquipmentSelect equipment={equipment} label="Trailer" name="trailer_asset_id" /></div>
    <div className="form-grid-three"><label>Ticket number<input name="ticket_reference" /></label>{showCosts ? <label>Dump fee<input min="0" name="fee" step="0.01" type="number" /></label> : null}<label>Private receipt<input accept="application/pdf,image/jpeg,image/png,image/webp" name="receipt" type="file" /></label></div>
    <label>Notes<textarea name="notes" rows={2} /></label><label className="checkbox-field"><input defaultChecked name="is_estimated" type="checkbox" />Quantity is estimated</label>
    <button disabled={pending} type="submit"><Truck size={18} />{pending ? "Recording..." : "Record disposal load"}</button>
  </form>;
}

export function ProductionBatchForm({ equipment, locations, materials }: { equipment: BasicOption[]; locations: InventoryLocationRecord[]; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(recordProductionBatch, initialState);
  return <form action={action} className="crm-form material-form"><FormMessage state={state} />
    <div className="form-grid-three"><label>Batch number<input name="batch_number" required /></label><LocationSelect label="Production location" locations={locations} name="location_id" required /><EquipmentSelect equipment={equipment} label="Equipment" name="equipment_asset_id" /></div>
    <fieldset className="nested-fieldset"><legend>Input</legend><div className="form-grid-three"><MaterialSelect materials={materials} name="input_material_id" /><label>Input quantity<input min="0.001" name="input_quantity" required step="0.001" type="number" /></label><UnitSelect name="input_unit" /></div></fieldset>
    <fieldset className="nested-fieldset"><legend>Output</legend><div className="form-grid-three"><MaterialSelect materials={materials} name="output_material_id" /><label>Estimated output<input min="0.001" name="output_quantity" required step="0.001" type="number" /></label><UnitSelect name="output_unit" /></div></fieldset>
    <div className="form-grid-three"><label>Color<input name="color" /></label><label>Dye / product used<input name="dye_product" /></label><label>Dye amount<input min="0" name="dye_amount" step="0.001" type="number" /></label></div>
    <div className="form-grid-three"><label>Dye unit<input name="dye_unit" /></label><label>Processed at<input name="processed_at" type="datetime-local" /></label><label>Cure / ready date<input name="ready_at" type="datetime-local" /></label></div>
    <div className="form-grid-two"><label>Labor hours<input min="0" name="labor_hours" step="0.01" type="number" /></label><label>Direct batch cost<input min="0" name="direct_cost" step="0.01" type="number" /></label></div>
    <label>Weather / moisture notes<textarea name="moisture_weather_notes" rows={2} /></label><label>Quality notes<textarea name="quality_notes" rows={2} /></label>
    <button disabled={pending} type="submit"><Factory size={18} />{pending ? "Recording..." : "Complete production batch"}</button>
  </form>;
}

export function DeliveryForm({ customers, equipment, jobs, locations, materials, organizations }: { customers: BasicOption[]; equipment: BasicOption[]; jobs: BasicOption[]; locations: InventoryLocationRecord[]; materials: MaterialRecord[]; organizations: BasicOption[] }) {
  const [state, action, pending] = useActionState(recordCustomerDelivery, initialState);
  return <form action={action} className="crm-form material-form" encType="multipart/form-data"><IdempotencyInput /><FormMessage state={state} />
    <div className="form-grid-three"><label>Contracting party<select name="contracting_party" required><option value="">Choose customer or organization</option><optgroup label="Individual customers">{customers.map((customer) => <option key={customer.id} value={`customer:${customer.id}`}>{customer.display_name}</option>)}</optgroup><optgroup label="Organizations">{organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.name}</option>)}</optgroup></select></label><MaterialSelect materials={materials} /><JobSelect jobs={jobs} /></div>
    <div className="form-grid-three"><label>Quantity<input min="0.001" name="quantity" required step="0.001" type="number" /></label><UnitSelect /><label>Status<select name="status"><option value="planned">Planned</option><option value="scheduled">Scheduled</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option></select></label></div>
    <div className="form-grid-three"><LocationSelect label="Source location" locations={locations} name="source_location_id" /><EquipmentSelect equipment={equipment} label="Vehicle" name="vehicle_asset_id" /><EquipmentSelect equipment={equipment} label="Trailer" name="trailer_asset_id" /></div>
    <div className="form-grid-two"><label>Window starts<input name="delivery_window_start" type="datetime-local" /></label><label>Window ends<input name="delivery_window_end" type="datetime-local" /></label></div>
    <label>Delivery instructions<textarea name="delivery_instructions" rows={2} /></label><label>Customer-visible notes<textarea name="customer_visible_notes" rows={2} /></label><label>Internal notes<textarea name="internal_notes" rows={2} /></label>
    <div className="form-grid-two"><label>Acknowledged by<input name="acknowledgment_name" /></label><label>Private proof photo<input accept="image/jpeg,image/png,image/webp" name="proof" type="file" /></label></div>
    <label className="checkbox-field"><input name="is_estimated" type="checkbox" />Quantity is estimated</label><button disabled={pending} type="submit"><Truck size={18} />{pending ? "Saving..." : "Save delivery"}</button>
  </form>;
}

export function StockpileMeasurementForm({ locations, materials }: { locations: InventoryLocationRecord[]; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(recordStockpileMeasurement, initialState);
  return <form action={action} className="crm-form material-form" encType="multipart/form-data"><FormMessage state={state} />
    <div className="form-grid-two"><MaterialSelect materials={materials} /><LocationSelect label="Stockpile location" locations={locations} name="location_id" required /></div>
    <div className="form-grid-three"><label>Quantity<input min="0" name="quantity" required step="0.001" type="number" /></label><UnitSelect /><label>Measurement method<select name="measurement_method"><option value="visual_estimate">Visual estimate</option><option value="dimensions_estimate">Dimensions estimate</option><option value="scale_weight">Scale weight</option><option value="metered">Metered</option><option value="counted">Counted</option><option value="other">Other</option></select></label></div>
    <label>Photo<input accept="image/jpeg,image/png,image/webp" name="photo" type="file" /></label><label>Notes<textarea name="notes" rows={2} /></label>
    <button disabled={pending} type="submit"><Save size={18} />{pending ? "Saving..." : "Save measurement"}</button>
  </form>;
}

export function ReverseTransactionForm({ transactionId }: { transactionId: string }) {
  const [state, action, pending] = useActionState(reverseInventoryTransaction, initialState);
  return <form action={action} className="inline-material-action"><input name="transaction_id" type="hidden" value={transactionId} /><input aria-label="Correction reason" name="reason" placeholder="Correction reason" required /><button className="secondary-action" disabled={pending} type="submit"><RotateCcw size={15} />{pending ? "Reversing..." : "Reverse"}</button><FormMessage state={state} /></form>;
}

export function TransactionCostReviewForm({ transactionId }: { transactionId: string }) {
  const [state, action, pending] = useActionState(reviewInventoryTransactionCost, initialState);
  return <form action={action} className="inline-material-action"><input name="transaction_id" type="hidden" value={transactionId} /><input aria-label="Review notes" name="review_notes" placeholder="Review notes (optional)" /><button disabled={pending} name="decision" type="submit" value="approved">{pending ? "Saving..." : "Approve cost"}</button><button className="secondary-action" disabled={pending} name="decision" type="submit" value="rejected">Reject cost</button><FormMessage state={state} /></form>;
}

export function CrewMaterialMovementForm({ jobId, locations, materials }: { jobId: string; locations: InventoryLocationRecord[]; materials: MaterialRecord[] }) {
  const [state, action, pending] = useActionState(recordInventoryMovement, initialState);
  return <form action={action} className="crm-form crew-material-form" encType="multipart/form-data"><input name="job_id" type="hidden" value={jobId} /><IdempotencyInput /><FormMessage state={state} />
    <label>What did you do?<select name="transaction_type">{crewInventoryTransactionTypes.map((value) => <option key={value} value={value}>{crewActionLabel(value)}</option>)}</select></label>
    <MaterialSelect materials={materials} /><div className="form-grid-two"><label>Quantity<input inputMode="decimal" min="0.001" name="quantity" required step="0.001" type="number" /></label><UnitSelect /></div>
    <div className="form-grid-two"><LocationSelect label="From" locations={locations} name="source_location_id" /><LocationSelect label="To" locations={locations} name="destination_location_id" /></div>
    <label>If this was not planned, explain why<textarea name="unplanned_reason" placeholder="Needed extra mulch after seeing site conditions" rows={2} /></label>
    <label>Notes<textarea name="notes" placeholder="What was loaded, used, returned, or delivered?" rows={2} /></label><label>Photo or receipt<input accept="application/pdf,image/jpeg,image/png,image/webp" name="attachment" type="file" /></label>
    <label className="checkbox-field"><input name="is_estimated" type="checkbox" />Quantity is estimated</label>
    <button className="crew-material-submit" disabled={pending} type="submit"><PackageCheck size={21} />{pending ? "Recording..." : "Record material"}</button>
  </form>;
}

function IdempotencyInput() {
  const [value, setValue] = useState("");
  useEffect(() => setValue(crypto.randomUUID()), []);
  return <input name="idempotency_key" type="hidden" value={value} />;
}
function FormMessage({ state }: { state: MaterialActionState }) { return state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null; }
function MaterialSelect({ materials, name = "material_id", optional = false }: { materials: MaterialRecord[]; name?: string; optional?: boolean }) { return <label>Material<select name={name} required={!optional}><option value="">{optional ? "No stock item" : "Choose material"}</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({materialLabel(material.default_unit)})</option>)}</select></label>; }
function UnitSelect({ name = "unit", optional = false }: { name?: string; optional?: boolean }) { return <label>Unit<select name={name} required={!optional}><option value="">Choose unit</option>{materialUnits.map((value) => <option key={value} value={value}>{materialLabel(value)}</option>)}</select></label>; }
function LocationSelect({ label, locations, name, required = false }: { label: string; locations: InventoryLocationRecord[]; name: string; required?: boolean }) { return <label>{label}<select name={name} required={required}><option value="">Not selected</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} - {materialLabel(location.location_type)}</option>)}</select></label>; }
function JobSelect({ jobs, required = false }: { jobs: BasicOption[]; required?: boolean }) { return <label>Work order<select name="job_id" required={required}><option value="">Not linked</option>{jobs.map((job) => <option key={job.id} value={job.id}>{materialLabel(job.service_type ?? "work order")} - {materialLabel(job.status ?? "open")}</option>)}</select></label>; }
function EquipmentSelect({ equipment, label, name }: { equipment: BasicOption[]; label: string; name: string }) { return <label>{label}<select name={name}><option value="">Not selected</option>{equipment.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_number} - {asset.name}</option>)}</select></label>; }
function crewActionLabel(value: string) { return ({ load: "Loaded onto truck or trailer", job_use: "Used on this job", return: "Returned unused material", delivery: "Delivered to customer", disposal: "Disposed / dumped", donation: "Donated / ChipDrop" } as Record<string, string>)[value] ?? materialLabel(value); }
