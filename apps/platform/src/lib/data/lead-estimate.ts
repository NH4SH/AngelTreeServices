import "server-only";

import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import {
  buildLeadEstimatePrefill,
  type LeadEstimateSourceRecord,
} from "@/lib/schedule/lead-estimate";

export async function getLeadEstimatePrefill(leadJobId: string) {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  if (!isUuid(leadJobId)) return { data: null, error: "Choose a valid website lead." };

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, status, service_type, requested_scope, internal_notes, preferred_contact_method, preferred_appointment_timing, source_detail, submitted_at, website_submission_id, customers:customers!jobs_customer_id_fkey(display_name, email, phone), organizations:organizations!jobs_organization_id_fkey(name, billing_email, billing_phone), onsite_contact:organization_contacts!jobs_onsite_contact_id_fkey(full_name, email, phone), property_contact:organization_contacts!jobs_property_manager_contact_id_fkey(full_name, email, phone), service_locations:service_locations!jobs_service_location_id_fkey(street, city, state, postal_code, access_notes, service_notes), lead_sources:lead_sources!jobs_lead_source_id_fkey(name), lead_estimate:schedule_events!schedule_events_lead_intake_job_id_fkey(id, title, starts_at, calendar_notes, schedule_event_assignments(employee_id, user_id))",
    )
    .eq("id", leadJobId)
    .not("website_submission_id", "is", null)
    .eq("lead_disposition", "active")
    .is("archived_at", null)
    .maybeSingle();

  if (error) return { data: null, error: safeStaffMessage(error.message) };
  if (!data) return { data: null, error: "Website lead not found or no access." };

  return {
    data: buildLeadEstimatePrefill(data as unknown as LeadEstimateSourceRecord),
    error: null,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
