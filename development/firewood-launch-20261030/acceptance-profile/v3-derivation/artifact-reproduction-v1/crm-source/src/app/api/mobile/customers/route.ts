import { apiError, apiSuccess } from "@/lib/api/responses";
import { recordActivity } from "@/lib/activity-log";
import {
  canCreateMobileParties,
  normalizeMobileDirectoryLimit,
  validateMobilePartyCreateInput,
} from "@/lib/api/mobile-field-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { createMobileParty, listMobileParties, searchMobileParties } from "@/lib/data/mobile-parties";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  try {
    if (query?.trim()) {
      return apiSuccess({
        results: await searchMobileParties(auth.context.supabase, query),
        nextCursor: null,
      });
    }
    return apiSuccess(await listMobileParties(auth.context.supabase, {
      cursor: url.searchParams.get("cursor"),
      limit: normalizeMobileDirectoryLimit(url.searchParams.get("limit")),
    }));
  } catch (error) {
    console.error("Mobile customer search failed", error);
    if (error instanceof Error && error.message.includes("cursor")) {
      return apiError("invalid_directory_cursor", "Refresh the customer directory and try again.", 400);
    }
    return apiError("customer_search_unavailable", "Customer search is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canCreateMobileParties(auth.context.roles)) {
    return apiError("customer_create_forbidden", "Your account cannot create customer records.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_customer", "Enter the customer or organization details.", 400);
  }
  const validated = validateMobilePartyCreateInput(body);
  if (!validated.value) return apiError("invalid_customer", validated.error, 400);

  try {
    const party = await createMobileParty(auth.context.supabase, validated.value);
    await recordActivity(auth.context.supabase, {
      actionCategory: "customers",
      actorUserId: auth.context.user.id,
      destinationPath: `/admin/${party.kind === "organization" ? "organizations" : "customers"}/${party.id}`,
      eventType: party.kind === "organization" ? "organization_created" : "customer_created",
      organizationId: party.kind === "organization" ? party.id : null,
      recordLabel: party.name,
      summary: `${party.name} was added from the field app.`,
      subjectId: party.id,
      subjectType: party.kind,
    });
    return apiSuccess({ party }, 201);
  } catch (error) {
    console.error("Mobile customer creation failed", error);
    return apiError("customer_create_failed", "The record could not be created. Check the details and try again.", 503);
  }
}
