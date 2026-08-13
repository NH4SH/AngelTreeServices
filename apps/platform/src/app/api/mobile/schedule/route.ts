import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, apiSuccess } from "@/lib/api/responses";
import {
  buildMobileSchedulePayload,
  mobileScheduleScopes,
  type MobileSchedulePayload,
  type MobileScheduleScope,
} from "@/lib/api/mobile-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getScheduleCalendarDataForClient } from "@/lib/data/schedule";
import { parseScheduleDateTime, shiftScheduleDateKey } from "@/lib/schedule/event-form";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumInclusiveRangeDays = 7;

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") ?? "";
  const endDate = url.searchParams.get("end") ?? startDate;
  const scope = (url.searchParams.get("scope") ?? "mine") as MobileScheduleScope;

  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    return apiError("invalid_date_range", "Use start and end dates in YYYY-MM-DD format.", 400);
  }

  if (!mobileScheduleScopes.includes(scope)) {
    return apiError("invalid_schedule_scope", "Use scope=mine or scope=team.", 400);
  }

  const rangeDays = getInclusiveRangeDays(startDate, endDate);
  if (rangeDays < 1 || rangeDays > maximumInclusiveRangeDays) {
    return apiError("invalid_date_range", "Schedule requests may include one through seven days.", 400);
  }

  const canViewTeamSchedule = auth.context.roles.includes("owner") || auth.context.roles.includes("admin");
  if (scope === "team" && !canViewTeamSchedule) {
    return apiError("team_schedule_forbidden", "Only an owner or admin may view the team schedule.", 403);
  }

  const { data: employee, error: employeeError } = await auth.context.supabase
    .from("employee_records")
    .select("id")
    .eq("auth_user_id", auth.context.user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (employeeError) {
    return apiError("employee_identity_unavailable", "Employee access could not be verified.", 503);
  }

  if (scope === "mine" && !employee) {
    return apiError("employee_access_required", "A linked employee record is required for My Schedule.", 403);
  }

  const start = parseScheduleDateTime(`${startDate}T00:00`);
  const endExclusiveDate = shiftScheduleDateKey(endDate, 1);
  const endExclusive = parseScheduleDateTime(`${endExclusiveDate}T00:00`);

  if (!start || !endExclusive) {
    return apiError("invalid_date_range", "The Eastern schedule window could not be calculated.", 400);
  }

  const result = await getScheduleCalendarDataForClient(auth.context.supabase, {
    startsAtOrAfter: start.toISOString(),
    startsBefore: endExclusive.toISOString(),
  });

  if (result.error) {
    return apiError("mobile_schedule_unavailable", "The schedule could not be loaded.", 503);
  }

  const payload = buildMobileSchedulePayload({
    data: result.data,
    endDate,
    identity: {
      authUserId: auth.context.user.id,
      employeeId: employee?.id ?? null,
    },
    scope,
    startDate,
  });

  return apiSuccess(await addPrimaryServiceLocationFallback(auth.context.supabase, payload));
}

async function addPrimaryServiceLocationFallback(
  supabase: SupabaseClient<any, "public", any>,
  payload: MobileSchedulePayload,
): Promise<MobileSchedulePayload> {
  const missingLocationItems = payload.items.filter((item) => (
    !item.location?.fullAddress && item.party?.id
  ));

  if (!missingLocationItems.length) return payload;

  const customerIds = unique(
    missingLocationItems
      .filter((item) => item.party?.kind === "customer")
      .map((item) => item.party?.id),
  );
  const organizationIds = unique(
    missingLocationItems
      .filter((item) => item.party?.kind === "organization")
      .map((item) => item.party?.id),
  );

  type LocationRow = {
    customer_id: string | null;
    organization_id: string | null;
    label: string | null;
    street: string;
    city: string;
    state: string;
    postal_code: string | null;
    access_notes: string | null;
    service_notes: string | null;
    updated_at: string;
  };

  const rows: LocationRow[] = [];

  if (customerIds.length) {
    const { data, error } = await supabase
      .from("service_locations")
      .select("customer_id, organization_id, label, street, city, state, postal_code, access_notes, service_notes, updated_at")
      .in("customer_id", customerIds)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (!error) rows.push(...((data ?? []) as LocationRow[]));
  }

  if (organizationIds.length) {
    const { data, error } = await supabase
      .from("service_locations")
      .select("customer_id, organization_id, label, street, city, state, postal_code, access_notes, service_notes, updated_at")
      .in("organization_id", organizationIds)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (!error) rows.push(...((data ?? []) as LocationRow[]));
  }

  if (!rows.length) return payload;

  type FallbackLocation = {
    label: string | null;
    fullAddress: string;
    accessNotes: string | null;
    serviceNotes: string | null;
    isPrimary: boolean;
  };

  const fallbackByParty = new Map<string, FallbackLocation>();

  for (const row of rows) {
    const kind = row.customer_id ? "customer" : row.organization_id ? "organization" : null;
    const partyId = row.customer_id ?? row.organization_id;
    if (!kind || !partyId) continue;

    const fullAddress = formatFullAddress(row);
    if (!fullAddress) continue;

    const key = `${kind}:${partyId}`;
    const candidate: FallbackLocation = {
      label: row.label,
      fullAddress,
      accessNotes: row.access_notes,
      serviceNotes: row.service_notes,
      isPrimary: row.label === "Primary service location",
    };
    const current = fallbackByParty.get(key);

    if (!current || (candidate.isPrimary && !current.isPrimary)) {
      fallbackByParty.set(key, candidate);
    }
  }

  return {
    ...payload,
    items: payload.items.map((item) => {
      if (item.location?.fullAddress || !item.party?.id) return item;
      const fallback = fallbackByParty.get(`${item.party.kind}:${item.party.id}`);
      if (!fallback) return item;

      return {
        ...item,
        location: {
          label: item.location?.label ?? fallback.label,
          fullAddress: fallback.fullAddress,
          accessNotes: item.location?.accessNotes ?? fallback.accessNotes,
          serviceNotes: item.location?.serviceNotes ?? fallback.serviceNotes,
        },
      };
    }),
  };
}

function formatFullAddress(location: {
  street: string;
  city: string;
  state: string;
  postal_code: string | null;
}) {
  const locality = [location.city, location.state].filter(Boolean).join(", ");
  const localityWithPostalCode = [locality, location.postal_code].filter(Boolean).join(" ");
  return [location.street, localityWithPostalCode].filter(Boolean).join(", ").trim();
}

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getInclusiveRangeDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}
