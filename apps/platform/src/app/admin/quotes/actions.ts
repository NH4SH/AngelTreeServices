"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { QuoteStatus } from "@/lib/types/database";

export type QuoteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function createQuote(
  _previousState: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const jobId = String(formData.get("job_id") ?? "");
  const status = String(formData.get("status") ?? "draft") as QuoteStatus;
  const customerMessage = String(formData.get("customer_message") ?? "").trim() || null;
  const itemDescription = String(formData.get("line_item_description") ?? "").trim();
  const quantity = Number.parseFloat(String(formData.get("line_item_quantity") ?? "1")) || 1;
  const unitPriceCents = toCents(formData.get("line_item_unit_price"));
  const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

  if (!jobId) {
    return { status: "error", message: "Choose a job before creating a quote." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      job_id: jobId,
      customer_id: job.customer_id,
      status,
      subtotal_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      customer_message: customerMessage,
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Could not create quote." };
  }

  if (itemDescription) {
    const { error: lineItemError } = await supabase.from("quote_line_items").insert({
      quote_id: quote.id,
      name: itemDescription.slice(0, 80),
      description: itemDescription,
      quantity,
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
      sort_order: 0,
    });

    if (lineItemError) {
      return { status: "error", message: `Quote saved, but line item failed: ${lineItemError.message}` };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  return { status: "success", message: "Quote saved." };
}
