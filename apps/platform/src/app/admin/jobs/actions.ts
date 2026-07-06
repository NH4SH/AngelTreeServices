"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  const customerId = String(formData.get("customer_id") ?? "");
  const serviceLocationId = String(formData.get("service_location_id") ?? "");
  const serviceType = String(formData.get("service_type") ?? "other");
  const requestedScope = String(formData.get("requested_scope") ?? "").trim();
  const status = String(formData.get("status") ?? "new_lead") as JobStatus;
  const priority = String(formData.get("priority") ?? "normal") as JobPriority;
  const estimatedDate = String(formData.get("estimated_date") ?? "");

  if (!customerId || !serviceLocationId || !requestedScope) {
    return { status: "error", message: "Customer, service location, and description are required." };
  }

  const scheduledStartAt = estimatedDate ? new Date(`${estimatedDate}T09:00:00`).toISOString() : null;

  const { error } = await supabase.from("jobs").insert({
    customer_id: customerId,
    service_location_id: serviceLocationId,
    service_type: serviceType,
    requested_scope: requestedScope,
    status,
    priority,
    scheduled_start_at: scheduledStartAt,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/schedule");
  return { status: "success", message: "Job saved." };
}
