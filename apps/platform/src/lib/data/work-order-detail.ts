import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DataResult } from "@/lib/types/database";
import type { WorkOrderDetail } from "@/lib/jobs/work-order-detail";

/** Office projection only. Closeout and other callers retain the full reader. */
export async function getWorkOrderDetail(jobId: string): Promise<DataResult<WorkOrderDetail | null>> {
  const unavailable = "Work order details could not load. Reload before making changes.";
  const db = await createClient();
  if (!db) return { data: null, error: "Supabase is not configured." };
  const { data, error } = await db.from("jobs").select(`
    *, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email),
    organizations(id, name, billing_email, billing_phone),
    service_locations(id, label, street, city, state, postal_code, access_notes, service_notes),
    assigned_crew:profiles!jobs_assigned_crew_user_id_fkey(id, full_name, email),
    assigned_employee:employee_records!jobs_assigned_crew_employee_id_fkey(id, auth_user_id, legal_name, preferred_name, contact_email),
    notes!notes_job_id_fkey(id, body, visibility),
    quotes!quotes_job_id_fkey(id, quote_number, status, total_cents,
      quote_line_items(id, name, description, quantity, unit_price_cents, total_cents, sort_order)),
    invoices!invoices_job_id_fkey(id, invoice_number, status, balance_due_cents),
    appointments!appointments_job_id_fkey(*, jobs(id, status, service_type, requested_scope),
      service_locations(id, label, street, city, state, postal_code),
      profiles:profiles!appointments_assigned_user_id_fkey(id, full_name, email)),
    schedule_events!schedule_events_job_id_fkey(*, service_locations(id, label, street, city, state, postal_code),
      schedule_event_assignments(id, event_id, employee_id, user_id, assignment_role,
        profiles(id, full_name, email), employee_records(id, auth_user_id, legal_name, preferred_name, contact_email))),
    equipment_assignments!equipment_assignments_job_id_fkey(id, asset_id, equipment_assets(id, asset_number, name, status, category)),
    change_orders!change_orders_job_id_fkey(id, change_order_number, status, invoice_id, created_at, approval_method,
      change_order_line_items(id, title, description, quantity, unit, unit_price_cents, amount_cents, sort_order))
  `).eq("id", jobId).eq("notes.visibility", "crew_visible").eq("schedule_events.event_type", "job")
    .order("created_at", { referencedTable: "notes", ascending: false })
    .order("created_at", { referencedTable: "quotes", ascending: false })
    .order("created_at", { referencedTable: "invoices", ascending: false })
    .order("starts_at", { referencedTable: "appointments", ascending: true })
    .order("starts_at", { referencedTable: "schedule_events", ascending: true })
    .order("starts_at", { referencedTable: "equipment_assignments", ascending: false })
    .order("created_at", { referencedTable: "change_orders", ascending: false }).maybeSingle();
  if (error) return { data: null, error: unavailable };
  if (!data) return { data: null, error: null };
  const arrays = ["notes", "quotes", "invoices", "appointments", "schedule_events", "equipment_assignments", "change_orders"] as const;
  if (data.id !== jobId || arrays.some(name => !Array.isArray(data[name]))
    || data.quotes.some((quote: { quote_line_items?: unknown } | null) => !quote || !Array.isArray(quote.quote_line_items))
    || data.change_orders.some((order: { change_order_line_items?: unknown } | null) => !order || !Array.isArray(order.change_order_line_items))) return { data: null, error: unavailable };
  return { data: data as WorkOrderDetail, error: null };
}
