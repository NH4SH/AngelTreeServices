import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanMobileSearchTerm,
  mobileJobOperationalStates,
  type MobileJobDirectoryItem,
  type MobileJobDirectoryPage,
  type MobileJobDirectoryScope,
} from "@/lib/api/mobile-field-contract";

type JobCursor = {
  offset: number;
  query: string;
  scope: MobileJobDirectoryScope;
};

type JobIndexRow = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  service_location_id: string | null;
  job_status: string;
  operational_state: string;
  priority: string;
  service_type: string | null;
  display_title: string | null;
  contracting_party_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  assigned_crew_name: string | null;
  appointment_starts_at: string | null;
  appointment_ends_at: string | null;
  updated_at: string;
  archived_at: string | null;
};

export async function listMobileJobs(
  supabase: SupabaseClient<any, "public", any>,
  input: {
    cursor: string | null;
    limit: number;
    query: string | null;
    scope: MobileJobDirectoryScope;
  },
): Promise<MobileJobDirectoryPage> {
  const search = cleanMobileSearchTerm(input.query);
  const offset = decodeCursor(input.cursor, input.scope, search);
  const select = [
    "id", "customer_id", "organization_id", "service_location_id", "job_status",
    "operational_state", "priority", "service_type", "display_title",
    "contracting_party_name", "street", "city", "state", "postal_code",
    "assigned_crew_name", "appointment_starts_at", "appointment_ends_at",
    "updated_at", "archived_at",
  ].join(",");

  let request = supabase
    .from("job_operations_search_index")
    .select(select)
    .is("archived_at", null)
    .in("operational_state", mobileJobOperationalStates(input.scope));

  if (input.scope === "unscheduled") request = request.eq("job_status", "accepted");
  if (search) {
    const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    request = request.ilike("expanded_search_text", pattern);
  }

  if (input.scope === "upcoming") {
    request = request
      .order("appointment_starts_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
  } else if (input.scope === "completed") {
    request = request.order("updated_at", { ascending: false });
  } else if (input.scope === "active") {
    request = request
      .order("action_rank", { ascending: true })
      .order("appointment_starts_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
  } else {
    request = request.order("updated_at", { ascending: false });
  }

  const { data, error } = await request.range(offset, offset + input.limit);
  if (error) throw error;

  const pageRows = ((data ?? []) as unknown as JobIndexRow[]).slice(0, input.limit);
  const contextByJob = await loadWorkContext(supabase, pageRows.map((row) => row.id));
  const results = pageRows.map((row): MobileJobDirectoryItem => {
    const context = contextByJob.get(row.id);
    const party = row.organization_id && row.contracting_party_name
      ? { id: row.organization_id, kind: "organization" as const, name: row.contracting_party_name }
      : row.customer_id && row.contracting_party_name
        ? { id: row.customer_id, kind: "customer" as const, name: row.contracting_party_name }
        : null;
    const fullAddress = formatAddress(row);

    return {
      id: row.id,
      status: row.job_status,
      operationalState: row.operational_state,
      priority: row.priority,
      serviceType: row.service_type,
      title: row.display_title || formatServiceType(row.service_type),
      party,
      serviceLocation: row.service_location_id && fullAddress
        ? { id: row.service_location_id, fullAddress, city: row.city }
        : null,
      scheduledStartAt: row.appointment_starts_at,
      scheduledEndAt: row.appointment_ends_at,
      completedAt: context?.completedAt ?? null,
      updatedAt: row.updated_at,
      assignedCrewNames: context?.assignedCrewNames.length
        ? context.assignedCrewNames
        : row.assigned_crew_name ? [row.assigned_crew_name] : [],
      workdayCount: context?.workdayCount ?? (row.appointment_starts_at ? 1 : 0),
    };
  });

  return {
    results,
    nextCursor: (data ?? []).length > input.limit
      ? encodeCursor({ offset: offset + input.limit, query: search, scope: input.scope })
      : null,
  };
}

async function loadWorkContext(supabase: SupabaseClient<any, "public", any>, jobIds: string[]) {
  const result = new Map<string, { assignedCrewNames: string[]; completedAt: string | null; workdayCount: number }>();
  if (!jobIds.length) return result;

  const [events, jobs] = await Promise.all([
    supabase
      .from("schedule_events")
      .select("id, job_id, status, schedule_event_assignments(employee_id, user_id, employee_records(preferred_name, legal_name, contact_email), profiles(full_name, email))")
      .in("job_id", jobIds)
      .eq("event_type", "job")
      .neq("status", "cancelled"),
    supabase.from("jobs").select("id, completed_at").in("id", jobIds),
  ]);
  if (events.error || jobs.error) throw events.error ?? jobs.error;

  const sessions = new Map<string, Set<string>>();
  const names = new Map<string, Set<string>>();
  for (const event of events.data ?? []) {
    if (!event.job_id) continue;
    if (!sessions.has(event.job_id)) sessions.set(event.job_id, new Set());
    sessions.get(event.job_id)!.add(event.id);
    if (!names.has(event.job_id)) names.set(event.job_id, new Set());
    for (const assignment of event.schedule_event_assignments ?? []) {
      const employee = one(assignment.employee_records);
      const profile = one(assignment.profiles);
      const name = employee?.preferred_name
        || employee?.legal_name
        || profile?.full_name
        || employee?.contact_email
        || profile?.email;
      if (name) names.get(event.job_id)!.add(name);
    }
  }
  const completedByJob = new Map((jobs.data ?? []).map((job) => [job.id, job.completed_at]));
  for (const jobId of jobIds) {
    result.set(jobId, {
      assignedCrewNames: [...(names.get(jobId) ?? [])].sort((a, b) => a.localeCompare(b)),
      completedAt: completedByJob.get(jobId) ?? null,
      workdayCount: sessions.get(jobId)?.size ?? 0,
    });
  }
  return result;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatAddress(row: { street: string | null; city: string | null; state: string | null; postal_code: string | null }) {
  const locality = [row.city, row.state].filter(Boolean).join(", ");
  return [row.street, [locality, row.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function formatServiceType(serviceType: string | null) {
  if (!serviceType) return "Field service work";
  return serviceType.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function encodeCursor(cursor: JobCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string | null, scope: MobileJobDirectoryScope, query: string) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<JobCursor>;
    if (parsed.scope !== scope || parsed.query !== query || !Number.isSafeInteger(parsed.offset) || parsed.offset! < 0) {
      throw new Error("invalid cursor");
    }
    return parsed.offset!;
  } catch {
    throw new Error("Invalid job directory cursor.");
  }
}
