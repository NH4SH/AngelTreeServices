import type { AppointmentWithRelations, ChangeOrder, ChangeOrderLineItem, EquipmentAsset, EquipmentAssignment, Invoice, JobWithRelations, Note, Quote, QuoteLineItem, ScheduleEventWithRelations } from "@/lib/types/database";

export type WorkOrderDetail = JobWithRelations & {
  notes: Pick<Note, "id" | "body" | "visibility">[];
  quotes: (Pick<Quote, "id" | "quote_number" | "status" | "total_cents"> & {
    quote_line_items: Pick<QuoteLineItem, "id" | "name" | "description" | "quantity" | "unit_price_cents" | "total_cents" | "sort_order">[];
  })[];
  invoices: Pick<Invoice, "id" | "invoice_number" | "status" | "balance_due_cents">[];
  appointments: AppointmentWithRelations[];
  schedule_events: ScheduleEventWithRelations[];
  equipment_assignments: (Pick<EquipmentAssignment, "id" | "asset_id"> & {
    equipment_assets: Pick<EquipmentAsset, "id" | "asset_number" | "name" | "status" | "category"> | null;
  })[];
  change_orders: (Pick<ChangeOrder, "id" | "change_order_number" | "status" | "invoice_id" | "created_at" | "approval_method"> & {
    change_order_line_items: Pick<ChangeOrderLineItem, "id" | "title" | "description" | "quantity" | "unit" | "unit_price_cents" | "amount_cents" | "sort_order">[];
  })[];
};

/** Both the full legacy reader and the office projection satisfy print needs. */
export type WorkOrderDocumentData = Pick<WorkOrderDetail, "id" | "status" | "service_type" | "requested_scope" | "scheduled_start_at" | "customers" | "organizations" | "service_locations" | "notes" | "quotes" | "change_orders">;
