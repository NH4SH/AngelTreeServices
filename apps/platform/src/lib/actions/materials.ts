"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  crewInventoryTransactionTypes,
  disposalDestinationTypes,
  inventoryLocationTypes,
  inventoryTransactionTypes,
  materialCategories,
  materialUnits,
} from "@/lib/materials/definitions";
import { createClient } from "@/lib/supabase/server";
import { prepareSafeUpload } from "@/lib/security/upload-validation";
import { safeStaffMessage } from "@/lib/security/errors";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";

export type MaterialActionState = { status: "idle" | "success" | "error" | "warning"; message: string };

async function getContext() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const roles = await getUserRoles(supabase, user.id);
  return { supabase, user, roles };
}

function isStaff(roles: readonly string[]) {
  return hasAllowedRole(roles as any, platformRoleGroups.internalStaff);
}

function isFinancial(roles: readonly string[]) {
  return hasAllowedRole(roles as any, platformRoleGroups.financialReporting);
}

export async function createMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can add materials.");
  const name = text(formData, "name", 160);
  const category = text(formData, "category", 40);
  const defaultUnit = text(formData, "default_unit", 40);
  if (!name || !materialCategories.includes(category as any) || !materialUnits.includes(defaultUnit as any)) {
    return fail("Material name, category, and unit are required.");
  }
  const { data: material, error } = await context.supabase.from("material_catalog").insert({
    name,
    category,
    sku: optional(formData, "sku", 80),
    description: optional(formData, "description", 1200),
    default_unit: defaultUnit,
    stock_tracked: formData.get("stock_tracked") === "on",
    is_billable: formData.get("is_billable") === "on",
    default_price_cents: money(formData, "default_price"),
    reorder_threshold: decimal(formData, "reorder_threshold"),
    notes: optional(formData, "notes", 1500),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !material) return fail(error?.message ?? "Could not add material.");

  if (isFinancial(context.roles) && formData.has("internal_unit_cost")) {
    const { error: costError } = await context.supabase.from("material_cost_settings").upsert({
      material_id: material.id,
      internal_unit_cost_cents: money(formData, "internal_unit_cost"),
      updated_by_user_id: context.user.id,
    });
    if (costError) return warning(`Material added, but internal cost could not save: ${costError.message}`);
  }
  await log(context, "material_created", material.id, "material");
  revalidateMaterials();
  return ok("Material added.");
}

export async function updateMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can edit materials.");
  const materialId = text(formData, "material_id", 80);
  const intent = text(formData, "intent", 20) || "save";
  if (!materialId) return fail("Material record is missing.");
  if (intent === "archive") {
    const { error } = await context.supabase.from("material_catalog").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", materialId);
    if (error) return fail(error.message);
    await log(context, "material_archived", materialId, "material");
    revalidateMaterials();
    return ok("Material archived. Inventory and job history were preserved.");
  }
  const name = text(formData, "name", 160);
  const category = text(formData, "category", 40);
  const defaultUnit = text(formData, "default_unit", 40);
  if (!name || !materialCategories.includes(category as any) || !materialUnits.includes(defaultUnit as any)) return fail("Material name, category, and unit are required.");
  const { data: existing } = await context.supabase.from("material_catalog").select("default_unit").eq("id", materialId).single();
  if (existing?.default_unit && existing.default_unit !== defaultUnit) {
    const { count } = await context.supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("material_id", materialId);
    if (count) return fail("The default unit cannot change after inventory history exists. Archive this material and create a new catalog item instead; quantities will not be converted automatically.");
  }
  const { error } = await context.supabase.from("material_catalog").update({
    name, category, sku: optional(formData, "sku", 80), description: optional(formData, "description", 1200),
    default_unit: defaultUnit, stock_tracked: formData.get("stock_tracked") === "on",
    is_billable: formData.get("is_billable") === "on", default_price_cents: money(formData, "default_price"),
    preferred_vendor_organization_id: optional(formData, "preferred_vendor_organization_id", 80),
    reorder_threshold: decimal(formData, "reorder_threshold"), notes: optional(formData, "notes", 1500), is_active: true,
  }).eq("id", materialId);
  if (error) return fail(error.message);
  if (isFinancial(context.roles) && formData.has("internal_unit_cost")) {
    const { error: costError } = await context.supabase.from("material_cost_settings").upsert({ material_id: materialId, internal_unit_cost_cents: money(formData, "internal_unit_cost"), updated_by_user_id: context.user.id });
    if (costError) return warning(`Material saved, but internal cost could not update: ${costError.message}`);
  }
  await log(context, "material_updated", materialId, "material");
  revalidateMaterials();
  return ok("Material changes saved.");
}

export async function createInventoryLocation(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can add inventory locations.");
  const name = text(formData, "name", 160);
  const locationType = text(formData, "location_type", 40);
  if (!name || !inventoryLocationTypes.includes(locationType as any)) return fail("Location name and type are required.");
  const { data, error } = await context.supabase.from("inventory_locations").insert({
    name,
    location_type: locationType,
    address: optional(formData, "address", 500),
    equipment_asset_id: optional(formData, "equipment_asset_id", 80),
    notes: optional(formData, "notes", 1000),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) return fail(error?.message ?? "Could not add location.");
  await log(context, "inventory_location_created", data.id, "inventory_location");
  revalidateMaterials();
  return ok("Inventory location added.");
}

export async function recordInventoryMovement(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !hasAllowedRole(context.roles, platformRoleGroups.crewApp)) return fail("This account cannot record material use.");
  const staff = isStaff(context.roles);
  const type = text(formData, "transaction_type", 40);
  const materialId = text(formData, "material_id", 80);
  const unit = text(formData, "unit", 40);
  const quantity = decimal(formData, "quantity");
  const jobId = optional(formData, "job_id", 80);
  const sourceLocationId = optional(formData, "source_location_id", 80);
  const destinationLocationId = optional(formData, "destination_location_id", 80);
  if (!inventoryTransactionTypes.includes(type as any) || (!staff && !crewInventoryTransactionTypes.includes(type as any))) {
    return fail("Choose a permitted movement type.");
  }
  if (!materialId || quantity === null || quantity <= 0 || !materialUnits.includes(unit as any)) {
    return fail("Material, positive quantity, and unit are required.");
  }
  if (["job_use", "delivery", "disposal", "donation", "loss", "sale"].includes(type) && !sourceLocationId) {
    return fail("Choose where the material came from.");
  }
  if (["receive", "produce", "return"].includes(type) && !destinationLocationId) {
    return fail("Choose where the material is going.");
  }
  if (["transfer", "load"].includes(type) && (!sourceLocationId || !destinationLocationId)) {
    return fail("Transfers and loads require both source and destination locations.");
  }
  if (!staff && !jobId) return fail("Crew material entries must be linked to the assigned work order.");

  const { data: material, error: materialError } = await context.supabase.from("material_catalog").select("id, name, default_unit, stock_tracked").eq("id", materialId).single();
  if (materialError || !material) return fail(materialError?.message ?? "Material not found.");
  if (material.default_unit !== unit) return fail(`Use ${material.default_unit.replaceAll("_", " ")} for this material. Unit conversions are not automatic.`);

  if (jobId && !staff) {
    const { data: job } = await context.supabase.from("jobs").select("assigned_crew_user_id").eq("id", jobId).single();
    if (job?.assigned_crew_user_id !== context.user.id) return fail("You can only record materials for an assigned work order.");
    const { count } = await context.supabase.from("job_material_requirements").select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("material_id", materialId);
    if (!count && !optional(formData, "unplanned_reason", 800)) return fail("This material was not planned. Add a short explanation before recording it.");
  }

  const attachment = await uploadMaterialFile(context, formData.get("attachment"), "movement");
  if (attachment.error) return fail(attachment.error);
  const notes = [optional(formData, "notes", 1200), optional(formData, "unplanned_reason", 800) ? `Unplanned: ${optional(formData, "unplanned_reason", 800)}` : null].filter(Boolean).join("\n") || null;
  const { data: transaction, error } = await context.supabase.from("inventory_transactions").insert({
    material_id: materialId,
    transaction_type: type,
    quantity,
    unit,
    source_location_id: sourceLocationId,
    destination_location_id: destinationLocationId,
    job_id: jobId,
    customer_id: optional(formData, "customer_id", 80),
    service_location_id: optional(formData, "service_location_id", 80),
    vendor_organization_id: staff ? optional(formData, "vendor_organization_id", 80) : null,
    equipment_asset_id: optional(formData, "equipment_asset_id", 80),
    occurred_at: dateTime(formData, "occurred_at") ?? new Date().toISOString(),
    is_estimated: formData.get("is_estimated") === "on",
    notes,
    attachment_storage_path: attachment.path,
    negative_override_reason: staff && isFinancial(context.roles) ? optional(formData, "negative_override_reason", 800) : null,
    idempotency_key: text(formData, "idempotency_key", 120) || crypto.randomUUID(),
    created_by_user_id: context.user.id,
  }).select("id, job_id").single();
  if (error || !transaction) {
    if (attachment.path) await context.supabase.storage.from("material-files").remove([attachment.path]);
    if (error?.code === "23505") return ok("This material entry was already recorded. No duplicate was created.");
    return fail(clean(error?.message ?? "Could not record material movement."));
  }

  if (type === "load") {
    await context.supabase.from("material_loads").insert({
      job_id: jobId,
      material_id: materialId,
      source_location_id: sourceLocationId,
      destination_location_id: destinationLocationId,
      destination_type: "job_site",
      quantity,
      unit,
      is_estimated: formData.get("is_estimated") === "on",
      vehicle_asset_id: optional(formData, "equipment_asset_id", 80),
      driver_user_id: context.user.id,
      notes,
      inventory_transaction_id: transaction.id,
      created_by_user_id: context.user.id,
    });
  }

  if (transaction.job_id && type === "job_use" && isFinancial(context.roles)) {
    await recognizeTransactionCost(context, transaction.id, transaction.job_id, materialId, quantity, material.name);
  }
  await log(context, `inventory_${type}`, transaction.id, "inventory_transaction", { job_id: jobId });
  revalidateMaterials(jobId);
  return ok(`${material.name}: material movement recorded.`);
}

export async function addJobMaterialRequirement(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can plan job materials.");
  const jobId = text(formData, "job_id", 80);
  const materialId = text(formData, "material_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = text(formData, "unit", 40);
  if (!jobId || !materialId || quantity === null || quantity <= 0) return fail("Work order, material, and quantity are required.");
  const unitError = await validateMaterialUnit(context, materialId, unit);
  if (unitError) return fail(unitError);
  const { data, error } = await context.supabase.from("job_material_requirements").insert({
    job_id: jobId,
    material_id: materialId,
    planned_quantity: quantity,
    unit,
    is_estimated: formData.get("is_estimated") === "on",
    notes: optional(formData, "notes", 1000),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) return fail(error?.message ?? "Could not add planned material.");
  await log(context, "job_material_planned", data.id, "job_material_requirement", { job_id: jobId });
  revalidateMaterials(jobId);
  return ok("Planned material added to the work order.");
}

export async function reserveMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can reserve inventory.");
  const materialId = text(formData, "material_id", 80);
  const locationId = text(formData, "location_id", 80);
  const jobId = text(formData, "job_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = text(formData, "unit", 40);
  if (!materialId || !locationId || !jobId || quantity === null || quantity <= 0) return fail("Material, location, work order, and quantity are required.");
  const unitError = await validateMaterialUnit(context, materialId, unit);
  if (unitError) return fail(unitError);
  const { data: balance } = await context.supabase.from("material_stock_balances").select("available_quantity").eq("material_id", materialId).eq("location_id", locationId).maybeSingle();
  const available = Number(balance?.available_quantity ?? 0);
  const overrideReason = optional(formData, "shortage_override_reason", 800);
  if (quantity > available && (!isFinancial(context.roles) || !overrideReason)) {
    return warning(`Only ${available} is available at this location. An authorized shortage override requires a reason.`);
  }
  const { data, error } = await context.supabase.from("inventory_reservations").insert({
    material_id: materialId, location_id: locationId, job_id: jobId, quantity, unit,
    job_material_requirement_id: optional(formData, "job_material_requirement_id", 80),
    expected_available_at: dateTime(formData, "expected_available_at"),
    notes: overrideReason ? `Shortage override: ${overrideReason}` : optional(formData, "notes", 1000),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) return fail(error?.message ?? "Could not reserve material.");
  await log(context, "material_reserved", data.id, "inventory_reservation", { job_id: jobId });
  revalidateMaterials(jobId);
  return ok("Material reserved. On-hand stock is unchanged; available stock is reduced.");
}

export async function releaseMaterialReservation(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can release reservations.");
  const reservationId = text(formData, "reservation_id", 80);
  const reason = text(formData, "reason", 800);
  if (!reservationId || !reason) return fail("Reservation and release reason are required.");
  const { data, error } = await context.supabase.from("inventory_reservations").update({
    status: "released", released_reason: reason, released_at: new Date().toISOString(), updated_by_user_id: context.user.id,
  }).eq("id", reservationId).eq("status", "active").select("id, job_id").maybeSingle();
  if (error || !data) return fail(error?.message ?? "The reservation is no longer active.");
  await log(context, "material_reservation_released", data.id, "inventory_reservation", { job_id: data.job_id });
  revalidateMaterials(data.job_id);
  return ok("Reservation released. History was preserved.");
}

export async function recordMaterialPurchase(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isFinancial(context.roles)) return fail("Financial material access is required to record purchases and unit costs.");
  const materialId = text(formData, "material_id", 80);
  const locationId = text(formData, "received_location_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = text(formData, "unit", 40);
  const unitCost = money(formData, "unit_cost");
  if (!materialId || !locationId || quantity === null || quantity <= 0 || unitCost === null) return fail("Material, received location, quantity, and unit cost are required.");
  const unitError = await validateMaterialUnit(context, materialId, unit);
  if (unitError) return fail(unitError);
  const receipt = await uploadMaterialFile(context, formData.get("receipt"), "purchase");
  if (receipt.error) return fail(receipt.error);
  const taxes = money(formData, "taxes_fees") ?? 0;
  const deliveryCharge = money(formData, "delivery_charge") ?? 0;
  const lineTotal = Math.round(quantity * unitCost);
  const total = lineTotal + taxes + deliveryCharge;
  const { data: purchase, error: purchaseError } = await context.supabase.from("material_purchases").insert({
    vendor_organization_id: optional(formData, "vendor_organization_id", 80),
    vendor_name: optional(formData, "vendor_name", 160),
    purchase_date: text(formData, "purchase_date", 20) || new Date().toISOString().slice(0, 10),
    purchase_order_reference: optional(formData, "purchase_order_reference", 120),
    taxes_fees_cents: taxes, delivery_charge_cents: deliveryCharge, total_cents: total,
    receipt_storage_path: receipt.path, received_location_id: locationId,
    received_by_user_id: context.user.id, notes: optional(formData, "notes", 1000),
    idempotency_key: text(formData, "idempotency_key", 120) || crypto.randomUUID(),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (purchaseError || !purchase) {
    if (purchaseError?.code === "23505") return ok("This purchase was already recorded. No duplicate was created.");
    return fail(purchaseError?.message ?? "Could not record purchase.");
  }
  const movementState = await insertMovement(context, {
    materialId, type: "receive", quantity, unit, destinationLocationId: locationId,
    notes: `Purchase ${purchase.id}`, idempotencyKey: `purchase:${purchase.id}`, attachmentPath: receipt.path,
  });
  if (!movementState.data) return warning(`Purchase saved, but receiving stock failed: ${movementState.error}`);
  const { error: itemError } = await context.supabase.from("material_purchase_items").insert({
    purchase_id: purchase.id, material_id: materialId, quantity, unit,
    unit_cost_cents: unitCost, line_total_cents: lineTotal, inventory_transaction_id: movementState.data.id,
  });
  await context.supabase.from("material_cost_settings").upsert({ material_id: materialId, internal_unit_cost_cents: unitCost, updated_by_user_id: context.user.id });
  if (itemError) return warning(`Stock was received, but purchase item detail needs review: ${itemError.message}`);
  await log(context, "material_purchase_received", purchase.id, "material_purchase");
  revalidateMaterials();
  return ok("Purchase recorded and inventory received. Cost will be recognized on job use, not at purchase.");
}

export async function recordDisposal(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !hasAllowedRole(context.roles, platformRoleGroups.crewApp)) return fail("This account cannot record disposal loads.");
  const staff = isStaff(context.roles);
  const jobId = text(formData, "job_id", 80);
  const destinationType = text(formData, "destination_type", 40);
  const destinationName = text(formData, "destination_name", 180);
  const materialId = optional(formData, "material_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = optional(formData, "unit", 40);
  if (!jobId || !destinationName || !disposalDestinationTypes.includes(destinationType as any)) return fail("Work order and disposal destination are required.");
  if ((materialId && (!quantity || !unit)) || (!materialId && (quantity || unit))) return fail("Material, quantity, and unit must be entered together.");
  if (!staff) {
    const { data: job } = await context.supabase.from("jobs").select("assigned_crew_user_id").eq("id", jobId).single();
    if (job?.assigned_crew_user_id !== context.user.id) return fail("You can only record disposal for an assigned work order.");
  }
  if (materialId && unit) {
    const unitError = await validateMaterialUnit(context, materialId, unit);
    if (unitError) return fail(unitError);
  }
  const receipt = await uploadMaterialFile(context, formData.get("receipt"), "disposal");
  if (receipt.error) return fail(receipt.error);
  let transactionId: string | null = null;
  if (materialId && quantity && unit && optional(formData, "source_location_id", 80)) {
    const movement = await insertMovement(context, {
      materialId, type: "disposal", quantity, unit,
      sourceLocationId: optional(formData, "source_location_id", 80), jobId,
      notes: destinationName, idempotencyKey: text(formData, "idempotency_key", 120) || crypto.randomUUID(), attachmentPath: receipt.path,
      isEstimated: formData.get("is_estimated") === "on",
    });
    if (!movement.data) return fail(movement.error ?? "Could not record disposal inventory movement.");
    transactionId = movement.data.id;
  }
  const fee = staff && isFinancial(context.roles) ? money(formData, "fee") : null;
  let jobCostEntryId: string | null = null;
  if (fee !== null && fee > 0) {
    const { data: cost } = await context.supabase.from("job_cost_entries").insert({
      job_id: jobId, category: "disposal", description: `Disposal fee - ${destinationName}`,
      amount_cents: fee, incurred_on: new Date().toISOString().slice(0, 10), receipt_storage_path: receipt.path,
      review_status: "approved", submitted_by_user_id: context.user.id, reviewed_by_user_id: context.user.id,
      reviewed_at: new Date().toISOString(), notes: optional(formData, "notes", 1000),
    }).select("id").single();
    jobCostEntryId = cost?.id ?? null;
  }
  const { data: disposal, error } = await context.supabase.from("disposal_records").insert({
    job_id: jobId, material_id: materialId, source_location_id: optional(formData, "source_location_id", 80),
    destination_type: destinationType, destination_name: destinationName,
    destination_organization_id: staff ? optional(formData, "destination_organization_id", 80) : null,
    quantity, unit, is_estimated: formData.get("is_estimated") === "on", status: "completed",
    driver_user_id: context.user.id, vehicle_asset_id: optional(formData, "vehicle_asset_id", 80),
    trailer_asset_id: optional(formData, "trailer_asset_id", 80), completed_at: new Date().toISOString(),
    fee_cents: fee, ticket_reference: optional(formData, "ticket_reference", 120), receipt_storage_path: receipt.path,
    notes: optional(formData, "notes", 1200), inventory_transaction_id: transactionId, job_cost_entry_id: jobCostEntryId,
    idempotency_key: text(formData, "idempotency_key", 120) || crypto.randomUUID(),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !disposal) {
    if (error?.code === "23505") return ok("This disposal load was already recorded. No duplicate was created.");
    return fail(error?.message ?? "Could not record disposal load.");
  }
  await log(context, "disposal_recorded", disposal.id, "disposal", { job_id: jobId });
  revalidateMaterials(jobId);
  return ok("Disposal load recorded. Receipt and fee remain private.");
}

export async function recordProductionBatch(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can record production batches.");
  const batchNumber = text(formData, "batch_number", 120);
  const inputMaterialId = text(formData, "input_material_id", 80);
  const outputMaterialId = text(formData, "output_material_id", 80);
  const locationId = text(formData, "location_id", 80);
  const inputQuantity = decimal(formData, "input_quantity");
  const outputQuantity = decimal(formData, "output_quantity");
  const inputUnit = text(formData, "input_unit", 40);
  const outputUnit = text(formData, "output_unit", 40);
  if (!batchNumber || !inputMaterialId || !outputMaterialId || !locationId || !inputQuantity || !outputQuantity) return fail("Batch number, input, output, location, and quantities are required.");
  const inputError = await validateMaterialUnit(context, inputMaterialId, inputUnit);
  const outputError = await validateMaterialUnit(context, outputMaterialId, outputUnit);
  if (inputError || outputError) return fail(inputError ?? outputError ?? "Invalid units.");
  const directCost = isFinancial(context.roles) ? money(formData, "direct_cost") : null;
  const { data: batch, error } = await context.supabase.from("production_batches").insert({
    batch_number: batchNumber, product_material_id: outputMaterialId, location_id: locationId, status: "completed",
    color: optional(formData, "color", 80), dye_product: optional(formData, "dye_product", 160),
    dye_amount: decimal(formData, "dye_amount"), dye_unit: optional(formData, "dye_unit", 40),
    processed_at: dateTime(formData, "processed_at") ?? new Date().toISOString(), ready_at: dateTime(formData, "ready_at"),
    moisture_weather_notes: optional(formData, "moisture_weather_notes", 1000), estimated_output_quantity: outputQuantity,
    output_unit: outputUnit, direct_cost_cents: directCost,
    cost_per_unit_cents: directCost == null ? null : Math.round(directCost / outputQuantity),
    quality_notes: optional(formData, "quality_notes", 1000), equipment_asset_id: optional(formData, "equipment_asset_id", 80),
    labor_hours: decimal(formData, "labor_hours"), created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !batch) return fail(error?.message ?? "Could not create production batch.");
  const inputMovement = await insertMovement(context, { materialId: inputMaterialId, type: "adjustment", quantity: inputQuantity, unit: inputUnit, sourceLocationId: locationId, notes: `Production input ${batchNumber}`, idempotencyKey: `batch:${batch.id}:input`, isEstimated: true });
  if (!inputMovement.data) return warning(`Batch saved, but input stock could not post: ${inputMovement.error}`);
  const outputMovement = await insertMovement(context, { materialId: outputMaterialId, type: "produce", quantity: outputQuantity, unit: outputUnit, destinationLocationId: locationId, notes: `Production output ${batchNumber}`, idempotencyKey: `batch:${batch.id}:output`, isEstimated: true });
  if (!outputMovement.data) return warning(`Input was posted, but output stock could not post: ${outputMovement.error}`);
  await context.supabase.from("production_batch_inputs").insert({ batch_id: batch.id, material_id: inputMaterialId, quantity: inputQuantity, unit: inputUnit, inventory_transaction_id: inputMovement.data.id });
  await context.supabase.from("production_batch_outputs").insert({ batch_id: batch.id, material_id: outputMaterialId, quantity: outputQuantity, unit: outputUnit, is_estimated: true, inventory_transaction_id: outputMovement.data.id });
  await log(context, "production_batch_completed", batch.id, "production_batch");
  revalidateMaterials();
  return ok("Production batch completed. Input and estimated output movements were recorded.");
}

export async function recordCustomerDelivery(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can schedule or complete deliveries.");
  const party = parseContractingParty(formData.get("contracting_party"));
  const materialId = text(formData, "material_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = text(formData, "unit", 40);
  const status = text(formData, "status", 30);
  if (!party || !materialId || !quantity || !["planned", "scheduled", "out_for_delivery", "delivered"].includes(status)) return fail("Contracting party, material, quantity, and delivery status are required.");
  const jobId = optional(formData, "job_id", 80);
  if (jobId) {
    const { data: job, error: jobError } = await context.supabase.from("jobs").select("customer_id, organization_id").eq("id", jobId).single();
    if (jobError || !job || !belongsToContractingParty(job, party)) return fail(jobError?.message ?? "The selected work order does not belong to this contracting party.");
  }
  const unitError = await validateMaterialUnit(context, materialId, unit);
  if (unitError) return fail(unitError);
  const proof = await uploadMaterialFile(context, formData.get("proof"), "delivery");
  if (proof.error) return fail(proof.error);
  let transactionId: string | null = null;
  if (status === "delivered") {
    const source = text(formData, "source_location_id", 80);
    if (!source) return fail("Choose the source location before marking a delivery complete.");
    const movement = await insertMovement(context, { materialId, type: "delivery", quantity, unit, sourceLocationId: source, jobId, notes: "Customer delivery", idempotencyKey: text(formData, "idempotency_key", 120) || crypto.randomUUID(), attachmentPath: proof.path, isEstimated: formData.get("is_estimated") === "on" });
    if (!movement.data) return fail(movement.error ?? "Could not post delivery movement.");
    transactionId = movement.data.id;
  }
  const { data, error } = await context.supabase.from("customer_deliveries").insert({
    customer_id: party.customerId, organization_id: party.organizationId, service_location_id: optional(formData, "service_location_id", 80),
    job_id: jobId, quote_id: optional(formData, "quote_id", 80), invoice_id: optional(formData, "invoice_id", 80),
    material_id: materialId, quantity, unit, delivery_window_start: dateTime(formData, "delivery_window_start"),
    delivery_window_end: dateTime(formData, "delivery_window_end"), delivered_at: status === "delivered" ? new Date().toISOString() : null,
    vehicle_asset_id: optional(formData, "vehicle_asset_id", 80), trailer_asset_id: optional(formData, "trailer_asset_id", 80),
    driver_user_id: optional(formData, "driver_user_id", 80), delivery_instructions: optional(formData, "delivery_instructions", 1000),
    customer_visible_notes: optional(formData, "customer_visible_notes", 1000), internal_notes: optional(formData, "internal_notes", 1000),
    proof_storage_path: proof.path, acknowledgment_name: optional(formData, "acknowledgment_name", 160),
    status, inventory_transaction_id: transactionId,
    idempotency_key: text(formData, "idempotency_key", 120) || crypto.randomUUID(),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return ok("This delivery was already recorded. No duplicate was created.");
    return fail(error?.message ?? "Could not record delivery.");
  }
  await log(context, status === "delivered" ? "material_delivery_completed" : "material_delivery_scheduled", data.id, "customer_delivery");
  revalidateMaterials(jobId);
  return ok(status === "delivered" ? "Delivery completed and stock updated." : "Delivery saved.");
}

export async function recordStockpileMeasurement(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isStaff(context.roles)) return fail("Only authorized staff can record stockpile measurements.");
  const materialId = text(formData, "material_id", 80);
  const locationId = text(formData, "location_id", 80);
  const quantity = decimal(formData, "quantity");
  const unit = text(formData, "unit", 40);
  const method = text(formData, "measurement_method", 40);
  if (!materialId || !locationId || quantity === null || quantity < 0 || !["visual_estimate", "dimensions_estimate", "scale_weight", "metered", "counted", "other"].includes(method)) return fail("Material, stockpile location, quantity, and method are required.");
  const unitError = await validateMaterialUnit(context, materialId, unit);
  if (unitError) return fail(unitError);
  const photo = await uploadMaterialFile(context, formData.get("photo"), "stockpile");
  if (photo.error) return fail(photo.error);
  const { data, error } = await context.supabase.from("stockpile_measurements").insert({
    material_id: materialId, location_id: locationId, quantity, unit, measurement_method: method,
    is_estimated: !["scale_weight", "metered", "counted"].includes(method), notes: optional(formData, "notes", 1000),
    photo_storage_path: photo.path, measured_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) return fail(error?.message ?? "Could not record stockpile measurement.");
  await log(context, "stockpile_measured", data.id, "stockpile_measurement");
  revalidateMaterials();
  return ok("Stockpile measurement saved and labeled by measurement method. Ledger stock was not silently overwritten.");
}

export async function reverseInventoryTransaction(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isFinancial(context.roles)) return fail("Only authorized financial staff can reverse inventory history.");
  const transactionId = text(formData, "transaction_id", 80);
  const reason = text(formData, "reason", 1000);
  if (!transactionId || !reason) return fail("Transaction and correction reason are required.");
  const { data: original, error: lookupError } = await context.supabase.from("inventory_transactions").select("*").eq("id", transactionId).single();
  if (lookupError || !original) return fail(lookupError?.message ?? "Transaction not found.");
  const { data, error } = await context.supabase.from("inventory_transactions").insert({
    material_id: original.material_id, transaction_type: "reversal", quantity: original.quantity, unit: original.unit,
    source_location_id: original.destination_location_id, destination_location_id: original.source_location_id,
    job_id: original.job_id, customer_id: original.customer_id, service_location_id: original.service_location_id,
    vendor_organization_id: original.vendor_organization_id, equipment_asset_id: original.equipment_asset_id,
    occurred_at: new Date().toISOString(), is_estimated: original.is_estimated, notes: `Reversal: ${reason}`,
    idempotency_key: `reversal:${transactionId}`, reversal_of_transaction_id: transactionId,
    negative_override_reason: `Authorized reversal: ${reason}`, created_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) return fail(clean(error?.message ?? "Could not reverse transaction."));
  await log(context, "inventory_transaction_reversed", data.id, "inventory_transaction", { original_transaction_id: transactionId });
  revalidateMaterials(original.job_id);
  return ok("Reversal recorded. The original transaction remains in history.");
}

export async function reviewInventoryTransactionCost(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const context = await getContext();
  if (!context || !isFinancial(context.roles)) return fail("Financial material access is required to review job cost.");
  const transactionId = text(formData, "transaction_id", 80);
  const decision = text(formData, "decision", 20);
  if (!transactionId || !["approved", "rejected"].includes(decision)) return fail("Choose approve or reject.");
  const [transactionResult, costResult] = await Promise.all([
    context.supabase.from("inventory_transactions").select("id, job_id, material_id, quantity, unit").eq("id", transactionId).single(),
    context.supabase.from("inventory_transaction_costs").select("*").eq("transaction_id", transactionId).single(),
  ]);
  const transaction = transactionResult.data;
  const cost = costResult.data;
  if (transactionResult.error || costResult.error || !transaction || !cost) return fail(transactionResult.error?.message ?? costResult.error?.message ?? "Cost snapshot not found.");
  if (cost.costing_status !== "pending") return fail("This transaction cost has already been reviewed.");
  let jobCostEntryId: string | null = null;
  if (decision === "approved") {
    if (!transaction.job_id || cost.direct_cost_cents == null) return fail("Add an internal unit cost before approving this job-use entry.");
    const { data: material } = await context.supabase.from("material_catalog").select("name").eq("id", transaction.material_id).single();
    const { data: jobCost, error: jobCostError } = await context.supabase.from("job_cost_entries").insert({
      job_id: transaction.job_id, category: "materials", description: `${material?.name ?? "Material"} used`,
      amount_cents: cost.direct_cost_cents, incurred_on: new Date().toISOString().slice(0, 10),
      review_status: "approved", submitted_by_user_id: context.user.id, reviewed_by_user_id: context.user.id,
      reviewed_at: new Date().toISOString(), notes: `Approved inventory transaction ${transactionId}. Historical unit cost snapshot preserved.`,
    }).select("id").single();
    if (jobCostError || !jobCost) return fail(jobCostError?.message ?? "Could not create job cost entry.");
    jobCostEntryId = jobCost.id;
  }
  const { error } = await context.supabase.from("inventory_transaction_costs").update({
    costing_status: decision, job_cost_entry_id: jobCostEntryId, reviewed_by_user_id: context.user.id,
    reviewed_at: new Date().toISOString(), notes: optional(formData, "review_notes", 800),
  }).eq("transaction_id", transactionId).eq("costing_status", "pending");
  if (error) return fail(error.message);
  await log(context, `inventory_cost_${decision}`, transactionId, "inventory_transaction", { job_id: transaction.job_id });
  revalidateMaterials(transaction.job_id);
  return ok(decision === "approved" ? "Material cost approved and added to job profitability." : "Material cost rejected. Inventory history remains unchanged.");
}

async function recognizeTransactionCost(context: NonNullable<Awaited<ReturnType<typeof getContext>>>, transactionId: string, jobId: string, materialId: string, quantity: number, materialName: string) {
  const { data: setting } = await context.supabase.from("material_cost_settings").select("internal_unit_cost_cents").eq("material_id", materialId).maybeSingle();
  const unitCost = setting?.internal_unit_cost_cents;
  if (unitCost == null) return;
  const directCost = Math.round(Number(quantity) * Number(unitCost));
  const { data: cost } = await context.supabase.from("job_cost_entries").insert({
    job_id: jobId, category: "materials", description: `${materialName} used`, amount_cents: directCost,
    incurred_on: new Date().toISOString().slice(0, 10), review_status: "approved", submitted_by_user_id: context.user.id,
    reviewed_by_user_id: context.user.id, reviewed_at: new Date().toISOString(), notes: `Inventory transaction ${transactionId}`,
  }).select("id").single();
  await context.supabase.from("inventory_transaction_costs").upsert({
    transaction_id: transactionId, unit_cost_cents_snapshot: unitCost, direct_cost_cents: directCost,
    costing_status: cost ? "approved" : "pending", job_cost_entry_id: cost?.id ?? null,
    reviewed_by_user_id: cost ? context.user.id : null, reviewed_at: cost ? new Date().toISOString() : null,
  }, { onConflict: "transaction_id" });
}

async function insertMovement(context: NonNullable<Awaited<ReturnType<typeof getContext>>>, input: { materialId: string; type: string; quantity: number; unit: string; sourceLocationId?: string | null; destinationLocationId?: string | null; jobId?: string | null; notes?: string | null; idempotencyKey: string; attachmentPath?: string | null; isEstimated?: boolean }) {
  const { data, error } = await context.supabase.from("inventory_transactions").insert({
    material_id: input.materialId, transaction_type: input.type, quantity: input.quantity, unit: input.unit,
    source_location_id: input.sourceLocationId ?? null, destination_location_id: input.destinationLocationId ?? null,
    job_id: input.jobId ?? null, occurred_at: new Date().toISOString(), is_estimated: input.isEstimated ?? false,
    notes: input.notes ?? null, attachment_storage_path: input.attachmentPath ?? null,
    idempotency_key: input.idempotencyKey, created_by_user_id: context.user.id,
  }).select("id").single();
  return { data, error: error ? clean(error.message) : null };
}

async function validateMaterialUnit(context: NonNullable<Awaited<ReturnType<typeof getContext>>>, materialId: string, unit: string) {
  if (!materialUnits.includes(unit as any)) return "Choose a valid unit.";
  const { data, error } = await context.supabase.from("material_catalog").select("default_unit").eq("id", materialId).single();
  if (error || !data) return error?.message ?? "Material not found.";
  return data.default_unit === unit ? null : `Use ${data.default_unit.replaceAll("_", " ")} for this material. Unit conversions are not automatic.`;
}

async function uploadMaterialFile(context: NonNullable<Awaited<ReturnType<typeof getContext>>>, value: FormDataEntryValue | null, folder: string) {
  if (!(value instanceof File) || value.size === 0) return { path: null, error: null };
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(value.type) || value.size > 15 * 1024 * 1024) {
    return { path: null, error: "Upload a PDF, JPEG, PNG, or WebP file up to 15 MB." };
  }
  const prepared = await prepareSafeUpload(value, { maxBytes: 15 * 1024 * 1024, allowDocuments: true });
  if (!prepared.data) return { path: null, error: prepared.error ?? "The file could not be validated." };
  const path = `${context.user.id}/${folder}/${Date.now()}-${value.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100)}`;
  const { error } = await context.supabase.storage.from("material-files").upload(path, prepared.data.bytes, { contentType: prepared.data.contentType, upsert: false });
  return { path: error ? null : path, error: error?.message ?? null };
}

async function log(context: NonNullable<Awaited<ReturnType<typeof getContext>>>, eventType: string, subjectId: string, subjectType: string, metadata: Record<string, string | null> = {}) {
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType, subjectId, subjectType, metadata });
}

function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function decimal(formData: FormData, key: string) { const raw = text(formData, key, 40); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; }
function money(formData: FormData, key: string) { const value = decimal(formData, key); return value === null ? null : Math.round(value * 100); }
function dateTime(formData: FormData, key: string) { const value = text(formData, key, 40); if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(message: string) { return message.replace(/^.*?: /, "").replace(/\.$/, "") + "."; }
function ok(message: string): MaterialActionState { return { status: "success", message }; }
function fail(message: string): MaterialActionState { return { status: "error", message: safeStaffMessage(message) }; }
function warning(message: string): MaterialActionState { return { status: "warning", message }; }
function revalidateMaterials(jobId?: string | null) { revalidatePath("/admin"); revalidatePath("/admin/materials"); revalidatePath("/admin/reports"); if (jobId) { revalidatePath(`/admin/jobs/${jobId}`); revalidatePath(`/crew/jobs/${jobId}`); } }
