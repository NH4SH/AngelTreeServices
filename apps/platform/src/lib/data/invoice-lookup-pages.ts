import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseQuoteLookupRequest, readQuoteLookupPage } from "@/lib/data/quote-lookup-pages";
import { lookupParty, lookupUuid, quoteLookupKinds, quoteLookupScope } from "@/lib/quotes/lookup-contract";
import { invoiceLookupNames, invoiceLookupValuesFrom, type InvoiceLookupSeeds } from "@/lib/invoices/lookup-contract";

export function parseInvoiceLookupRequest(params: URLSearchParams) {
  const input = parseQuoteLookupRequest(params);
  return input && ["party", "location", "job"].includes(input.kind) ? input : null;
}
export async function getInvoiceCreationLookups(customerId = "", jobId = "") {
  const values = invoiceLookupValuesFrom({ contracting_party: customerId ? `customer:${customerId}` : "", job_id: jobId });
  const data: InvoiceLookupSeeds = {};
  if (!customerId && !jobId) return { values, data, error: null };
  try {
    if (customerId && !lookupUuid(customerId) || jobId && !lookupUuid(jobId)) throw Error("Invalid prefill");
    const db = await createClient();
    if (!db) throw Error("Lookup unavailable");
    if (jobId) {
      const result = await db.from("jobs").select("id, customer_id, organization_id, service_location_id").eq("id", jobId).is("archived_at", null).in("status", ["completed", "ready_to_invoice"]).maybeSingle();
      if (result.error || !result.data || Boolean(result.data.customer_id) === Boolean(result.data.organization_id)) throw Error("Job unavailable");
      const jobParty = result.data.organization_id ? `organization:${result.data.organization_id}` : `customer:${result.data.customer_id}`;
      if (values.contracting_party && values.contracting_party !== jobParty) throw Error("Conflicting prefill");
      values.contracting_party = jobParty;
      values.service_location_id = result.data.service_location_id ?? "";
    }
    if (!lookupParty(values.contracting_party)) throw Error("Party unavailable");
    await Promise.all(invoiceLookupNames.filter(name => values[name]).map(async name => {
      const kind = quoteLookupKinds[name], party = quoteLookupScope(kind, values.contracting_party);
      const input = parseInvoiceLookupRequest(new URLSearchParams({ kind, party, selected: values[name] }));
      if (!input) throw Error("Invalid selection");
      const page = await readQuoteLookupPage(db, input, true), option = page.items.find(item => item.value === values[name]);
      if (!option) throw Error("Selection unavailable");
      data[name] = option;
    }));
    return { values, data, error: null };
  } catch { return { values, data: {}, error: "The selected invoice details could not load. Review or retry the selected records before saving." }; }
}
