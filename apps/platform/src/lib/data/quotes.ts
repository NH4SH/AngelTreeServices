import { createClient } from "@/lib/supabase/server";
import type { DataResult, JobWithRelations, Note, QuoteDetail, QuoteWithRelations } from "@/lib/types/database";

export async function getQuotes(): Promise<DataResult<QuoteWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "*, jobs(id, status, service_type), customers(id, display_name, phone, email), quote_line_items(*)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as QuoteWithRelations[], error: null };
}

export async function getQuotesAwaitingResponse() {
  const quotes = await getQuotes();

  if (quotes.error) {
    return { data: [], error: quotes.error };
  }

  return {
    data: quotes.data.filter((quote) => quote.status === "sent" || quote.status === "change_requested"),
    error: null,
  };
}

export async function getQuotesByCustomerId(customerId: string): Promise<DataResult<QuoteWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*, jobs(id, status, service_type), customers(id, display_name, phone, email), quote_line_items(*)")
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
      "*, jobs(*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)), customers(id, display_name, phone, email), quote_line_items(*)",
    )
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { data: null, error: quoteError?.message ?? "Quote not found or no access." };
  }

  const jobId = (quote as QuoteWithRelations).job_id;
  const { data: notes, error: notesError } = await supabase
    .from("notes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return {
    data: {
      ...(quote as QuoteWithRelations),
      jobs: (quote as { jobs?: JobWithRelations | null }).jobs ?? null,
      notes: (notes ?? []) as Note[],
    },
    error: notesError?.message ?? null,
  };
}
