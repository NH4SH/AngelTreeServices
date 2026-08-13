import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/responses";
import type { MobilePartyKind } from "@/lib/api/mobile-field-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getMobilePartyDetail } from "@/lib/data/mobile-parties";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteProps = {
  params: Promise<{ kind: string; partyId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteProps) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);

  const { kind: rawKind, partyId } = await params;
  if (!uuidPattern.test(partyId) || !["customer", "organization"].includes(rawKind)) {
    return apiError("invalid_party", "Use a valid customer or organization identifier.", 400);
  }

  try {
    const detail = await getMobilePartyDetail({
      id: partyId,
      kind: rawKind as MobilePartyKind,
      roles: auth.context.roles,
      supabase: auth.context.supabase,
    });
    if (!detail) return apiError("party_not_available", "This record was not found or is not available to your account.", 404);
    return apiSuccess({ party: detail });
  } catch (error) {
    console.error("Mobile party detail failed", error);
    return apiError("party_detail_unavailable", "This customer could not be loaded.", 503);
  }
}
