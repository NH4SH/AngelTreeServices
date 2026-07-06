import { createClient } from "@/lib/supabase/server";
import type { DataResult, QuoteWithRelations } from "@/lib/types/database";

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
