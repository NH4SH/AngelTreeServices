import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DataResult, EmailEvent } from "@/lib/types/database";

export type EmailEventFilters = {
  customerId?: string;
  invoiceId?: string;
  jobId?: string;
  quoteId?: string;
  types?: EmailEvent["email_type"][];
  limit?: number;
};

export async function getEmailEvents(filters: EmailEventFilters = {}): Promise<DataResult<EmailEvent[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("email_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 12);

  if (filters.customerId) {
    query = query.eq("related_customer_id", filters.customerId);
  }

  if (filters.jobId) {
    query = query.eq("related_job_id", filters.jobId);
  }

  if (filters.quoteId) {
    query = query.eq("related_quote_id", filters.quoteId);
  }

  if (filters.invoiceId) {
    query = query.eq("related_invoice_id", filters.invoiceId);
  }

  if (filters.types?.length) {
    query = query.in("email_type", filters.types);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as EmailEvent[], error: null };
}
