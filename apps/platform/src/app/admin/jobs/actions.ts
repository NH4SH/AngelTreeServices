"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import type { JobPriority, JobStatus } from "@/lib/types/database";

export type JobActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function createJob(
  _previousState: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const party = parseContractingParty(formData.get("contracting_party"));
  const serviceLocationId = String(formData.get("service_location_id") ?? "");
  const serviceType = String(formData.get("service_type") ?? "other");
  const requestedScope = String(formData.get("requested_scope") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal") as JobPriority;
  const estimatedDate = String(formData.get("estimated_date") ?? "");
  const leadSourceId = String(formData.get("lead_source_id") ?? "").trim() || null;
  const leadCampaign = String(formData.get("lead_campaign") ?? "").trim().slice(0, 240) || null;

  if (!party || !serviceLocationId || !requestedScope) {
    return { status: "error", message: "Contracting party, service location, and description are required." };
  }

  const { data: serviceLocation, error: locationError } = await supabase
    .from("service_locations")
    .select("id, customer_id, organization_id")
    .eq("id", serviceLocationId)
    .single();

  if (locationError || !serviceLocation) {
    return { status: "error", message: locationError?.message ?? "Could not find the selected service location." };
  }

  if (!belongsToContractingParty(serviceLocation, party)) {
    return { status: "error", message: "Selected service location does not belong to the selected contracting party." };
  }

  const scheduledStartAt = estimatedDate ? new Date(`${estimatedDate}T09:00:00`).toISOString() : null;
  const status: JobStatus = scheduledStartAt ? "estimate_scheduled" : "new_lead";

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: party.customerId,
      organization_id: party.organizationId,
      service_location_id: serviceLocationId,
      service_type: serviceType,
      requested_scope: requestedScope,
      status,
      priority,
      lead_source_id: leadSourceId,
      lead_campaign: leadCampaign,
      scheduled_start_at: scheduledStartAt,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { status: "error", message: error?.message ?? "Could not create work order." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "work_order_created",
    subjectId: job.id,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/schedule");
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
  return { status: "success", message: "Job saved." };
}
