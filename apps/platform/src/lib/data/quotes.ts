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
      "*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_events(id, title, event_type, starts_at, ends_at), quote_line_items(*)",
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
    .select("*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)")
    .in("status", ["sent", "change_requested"])
    .order("created_at", { ascending: false })
    .limit(12);

  return {
    data: (data ?? []) as QuoteWithRelations[],
    error: error?.message ?? null,
  };
}

export async function getQuoteDashboardSummaries() {
  const supabase = await createClient();

  if (!supabase) {
    return {
      data: { drafts: [] as QuoteWithRelations[], awaitingResponse: [] as QuoteWithRelations[] },
      error: "Supabase is not configured.",
    };
  }

  const quoteSelect = "*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)";
  const [drafts, awaitingResponse] = await Promise.all([
    supabase
      .from("quotes")
      .select(quoteSelect)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("quotes")
      .select(quoteSelect)
      .in("status", ["sent", "change_requested"])
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  return {
    data: {
      drafts: (drafts.data ?? []) as QuoteWithRelations[],
      awaitingResponse: (awaitingResponse.data ?? []) as QuoteWithRelations[],
    },
    error: drafts.error?.message ?? awaitingResponse.error?.message ?? null,
  };
}

export async function getQuotesByCustomerId(customerId: string): Promise<DataResult<QuoteWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)")
    .eq("customer_id", customerId)
    .is("organization_id", null)
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
      "*, jobs:jobs!quotes_job_id_fkey(*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), recipient_contact:organization_contacts!quotes_recipient_contact_id_fkey(id, full_name, email, phone, is_active), approval_contact:organization_contacts!quotes_approval_contact_id_fkey(id, full_name, email, phone, is_active), onsite_contact:organization_contacts!quotes_onsite_contact_id_fkey(id, full_name, email, phone, is_active), billing_contact:organization_contacts!quotes_billing_contact_id_fkey(id, full_name, email, phone, is_active), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_events(id, title, event_type, starts_at, ends_at), quote_line_items(*)",
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
    : typedQuote.customer_id
      ? notesQuery.eq("customer_id", typedQuote.customer_id)
      : notesQuery.eq("service_location_id", typedQuote.service_location_id);
  const [notes, invoices] = await Promise.all([
    scopedNotesQuery,
    supabase
      .from("invoices")
      .select(
        "*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
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
