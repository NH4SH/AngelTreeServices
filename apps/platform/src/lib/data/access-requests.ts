import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AssignableUser, DataResult, EmployeeAccessRequest } from "@/lib/types/database";

export const approvalRoleOptions = ["admin", "estimator", "crew", "payroll_admin"] as const;
export type AccessApprovalRole = (typeof approvalRoleOptions)[number];

type ReviewerProfile = Pick<AssignableUser, "id" | "full_name" | "email">;

export type EmployeeAccessRequestWithReviewer = EmployeeAccessRequest & {
  reviewer_label?: string | null;
};

export async function getCurrentEmployeeAccessRequestFromClient(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  userEmail: string | null,
): Promise<DataResult<EmployeeAccessRequestWithReviewer | null>> {
  const byUserId = await supabase
    .from("employee_access_requests")
    .select("*")
    .eq("auth_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byUserId.error) {
    return { data: null, error: byUserId.error.message };
  }

  if (byUserId.data) {
    return {
      data: byUserId.data as EmployeeAccessRequestWithReviewer,
      error: null,
    };
  }

  if (!userEmail) {
    return { data: null, error: null };
  }

  const byEmail = await supabase
    .from("employee_access_requests")
    .select("*")
    .ilike("email", userEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.error) {
    return { data: null, error: byEmail.error.message };
  }

  return {
    data: (byEmail.data ?? null) as EmployeeAccessRequestWithReviewer | null,
    error: null,
  };
}

export async function getEmployeeAccessRequests(): Promise<DataResult<EmployeeAccessRequestWithReviewer[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("employee_access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const reviewerIds = [...new Set(
    ((data ?? []) as EmployeeAccessRequest[])
      .map((request) => request.reviewed_by_user_id)
      .filter(Boolean),
  )] as string[];

  const reviewerProfiles = reviewerIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", reviewerIds)
    : { data: [], error: null };

  if (reviewerProfiles.error) {
    return { data: [], error: reviewerProfiles.error.message };
  }

  const reviewersById = new Map(
    ((reviewerProfiles.data ?? []) as ReviewerProfile[]).map((profile) => [
      profile.id,
      profile.full_name || profile.email || "Reviewer",
    ]),
  );

  return {
    data: ((data ?? []) as EmployeeAccessRequest[]).map((request) => ({
      ...request,
      reviewer_label: request.reviewed_by_user_id
        ? (reviewersById.get(request.reviewed_by_user_id) ?? "Reviewer")
        : null,
    })),
    error: null,
  };
}
