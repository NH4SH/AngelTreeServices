import type { ChangeOrderJobOption } from "@/lib/data/change-orders";
import { lookupUuid, type QuoteLookupOption } from "@/lib/quotes/lookup-contract";

export type ChangeOrderJobLookup = QuoteLookupOption & { job: ChangeOrderJobOption };
export function isChangeOrderJobLookup(option: QuoteLookupOption): option is ChangeOrderJobLookup {
  const job = (option as ChangeOrderJobLookup).job;
  return Boolean(job && job.id === option.value && lookupUuid(job.id)
    && (job.customer_id === null || lookupUuid(job.customer_id)) && (job.organization_id === null || lookupUuid(job.organization_id))
    && (job.source_quote_id === null || lookupUuid(job.source_quote_id)) && (job.service_location_id === null || lookupUuid(job.service_location_id))
    && typeof job.status === "string" && (job.service_type === null || typeof job.service_type === "string"));
}
export function changeOrderJobLabel(job: ChangeOrderJobOption) {
  return `${job.organizations?.name ?? job.customers?.display_name ?? "Unknown account"} - ${job.service_locations?.label || job.service_locations?.street || "No property label"} - ${(job.service_type ?? "work order").replaceAll("_", " ")}`;
}
