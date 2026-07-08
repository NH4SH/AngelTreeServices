import { createClient } from "@/lib/supabase/server";
import type { DataResult, InvoiceWithRelations, JobWithRelations, Note, QuoteDetail, QuoteWithRelations } from "@/lib/types/database";

export async function getQuotes(): Promise<DataResult<QuoteWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "*, jobs(id, status, service_type), customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_events(id, title, event_type, starts_at, ends_at), quote_line_items(*)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as QuoteWithRelations[], error: null };
}

export async function getQuotesAwaitingResponse() {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*, jobs(id, status, service_type), customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)")
    .in("status", ["sent", "change_requested"])
    .order("created_at", { ascending: false })
    .limit(12);

  return {
    data: (data ?? []) as QuoteWithRelations[],
    error: error?.message ?? null,
  };
}

export async function getQuotesByCustomerId(customerId: string): Promise<DataResult<QuoteWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*, jobs(id, status, service_type), customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as QuoteWithRelations[], error: null };
}

export async function getQuoteDetail(quoteId: string): Promise<DataResult<QuoteDetail | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "*, jobs(*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)), customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_events(id, title, event_type, starts_at, ends_at), quote_line_items(*)",
    )
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { data: null, error: quoteError?.message ?? "Quote not found or no access." };
  }

  const typedQuote = quote as QuoteWithRelations;
  const jobId = typedQuote.job_id;
  const notesQuery = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });
  const scopedNotesQuery = jobId
    ? notesQuery.eq("job_id", jobId)
    : notesQuery.eq("customer_id", typedQuote.customer_id);
  const [notes, invoices] = await Promise.all([
    scopedNotesQuery,
    supabase
      .from("invoices")
      .select(
        "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), invoice_line_items(*), payments(*)",
      )
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false }),
  ]);

  const firstError = notes.error?.message ?? invoices.error?.message ?? null;

  return {
    data: {
      ...(quote as QuoteWithRelations),
      jobs: (quote as { jobs?: JobWithRelations | null }).jobs ?? null,
      invoices: (invoices.data ?? []) as InvoiceWithRelations[],
      notes: (notes.data ?? []) as Note[],
    },
    error: firstError,
  };
}
