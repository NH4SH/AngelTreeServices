"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type QuoteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

type QuoteLineItemInput = {
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number;
};

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

  const customerId = String(formData.get("customer_id") ?? "");
  const serviceLocationIdInput = String(formData.get("service_location_id") ?? "");
  const estimateScheduleEventId = String(formData.get("estimate_schedule_event_id") ?? "") || null;
  const jobId = String(formData.get("job_id") ?? "") || null;
  const customerMessage = String(formData.get("customer_message") ?? "").trim() || null;
  const lineItems = getQuoteLineItems(formData);
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!customerId) {
    return { status: "error", message: "Choose a customer before creating a draft quote." };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return { status: "error", message: customerError?.message ?? "Could not find the selected customer." };
  }

  let serviceLocationId = serviceLocationIdInput || null;

  if (estimateScheduleEventId) {
    const { data: scheduleEvent, error: scheduleEventError } = await supabase
      .from("schedule_events")
      .select("id, service_location_id")
      .eq("id", estimateScheduleEventId)
      .eq("event_type", "estimate")
      .single();

    if (scheduleEventError || !scheduleEvent) {
      return { status: "error", message: scheduleEventError?.message ?? "Could not find the selected estimate event." };
    }

    if (serviceLocationId && scheduleEvent.service_location_id && serviceLocationId !== scheduleEvent.service_location_id) {
      return { status: "error", message: "Selected estimate event and service location do not match." };
    }

    serviceLocationId ||= scheduleEvent.service_location_id ?? null;
  }

  if (!serviceLocationId && !jobId) {
    return { status: "error", message: "Choose a service location or link an existing job before saving the draft quote." };
  }

  if (serviceLocationId) {
    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .select("id, customer_id")
      .eq("id", serviceLocationId)
      .single();

    if (locationError || !location) {
      return { status: "error", message: locationError?.message ?? "Could not find the selected service location." };
    }

    if (location.customer_id !== customerId) {
      return { status: "error", message: "Selected service location does not belong to the selected customer." };
    }
  }

  if (jobId) {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, customer_id, service_location_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
    }

    if (job.customer_id !== customerId) {
      return { status: "error", message: "Selected job does not belong to the selected customer." };
    }

    serviceLocationId ||= job.service_location_id;

    if (serviceLocationId !== job.service_location_id) {
      return { status: "error", message: "Selected job and service location do not match." };
    }
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      job_id: jobId,
      customer_id: customerId,
      service_location_id: serviceLocationId,
      estimate_schedule_event_id: estimateScheduleEventId,
      status: "draft",
      subtotal_cents: subtotalCents,
      tax_cents: 0,
      total_cents: subtotalCents,
      customer_message: customerMessage,
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Could not create quote." };
  }

  if (lineItems.length > 0) {
    const { error: lineItemError } = await supabase.from("quote_line_items").insert(
      lineItems.map((item) => ({
        quote_id: quote.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        total_cents: item.totalCents,
        sort_order: item.sortOrder,
      })),
    );

    if (lineItemError) {
      return { status: "error", message: `Quote saved, but line item failed: ${lineItemError.message}` };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/customers/${customerId}`);
  return { status: "success", message: "Draft quote saved." };
}

function getQuoteLineItems(formData: FormData): QuoteLineItemInput[] {
  const names = formData.getAll("line_item_name");
  const descriptions = formData.getAll("line_item_description");
  const quantities = formData.getAll("line_item_quantity");
  const unitPrices = formData.getAll("line_item_unit_price");
  const itemCount = Math.max(names.length, descriptions.length, quantities.length, unitPrices.length);
  const items: QuoteLineItemInput[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const name = String(names[index] ?? "").trim();
    const description = normalizeMultilineText(descriptions[index]);
    const hasContent = Boolean(name || description?.trim());
    const quantity = Math.max(0, Number.parseFloat(String(quantities[index] ?? "1")) || 1);
    const unitPriceCents = toCents(unitPrices[index] ?? null);
    const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

    if (!hasContent && totalCents === 0) {
      continue;
    }

    items.push({
      name: getLineItemName(name, description, index),
      description,
      quantity,
      unitPriceCents,
      totalCents,
      sortOrder: items.length,
    });
  }

  return items;
}

function normalizeMultilineText(value: FormDataEntryValue | undefined) {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trimEnd();
  return text.trim() ? text : null;
}

function getLineItemName(name: string, description: string | null, index: number) {
  if (name) {
    return name.slice(0, 120);
  }

  const firstDescriptionLine = description?.split("\n").find((line) => line.trim())?.trim();
  return (firstDescriptionLine || `Line item ${index + 1}`).slice(0, 120);
}
