"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import {
  getUserRoles,
  hasAllowedRole,
  platformRoleGroups,
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type RecurringActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export const initialRecurringActionState: RecurringActionState = {
  status: "idle",
  message: "",
};

export async function createFollowUpTask(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const title = text(formData, "title", 180);
  const dueAt = dateTime(formData.get("due_at"));
  const subject = await resolveSubject(auth.supabase, formData);
  if (!title || !dueAt || subject.error)
    return failure(subject.error ?? "Title and due date are required.");
  const { data, error } = await auth.supabase
    .from("follow_up_tasks")
    .insert({
      ...subject.values,
      title,
      description: optionalMultiline(formData, "description", 3000),
      task_type: allowed(text(formData, "task_type", 40), taskTypes, "other"),
      due_at: dueAt,
      priority: allowed(text(formData, "priority", 20), priorities, "normal"),
      assigned_to_user_id: optional(formData, "assigned_to_user_id", 80),
      notes: optionalMultiline(formData, "notes", 2000),
      created_by_user_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data)
    return failure(error?.message ?? "Could not create the follow-up.");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "follow_up_created",
    subjectId: data.id,
    subjectType: "follow_up_task",
  });
  revalidateRecurring(
    subject.values.customer_id,
    subject.values.organization_id,
  );
  return success("Follow-up added to the staff queue.");
}

export async function updateFollowUpTask(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const taskId = text(formData, "task_id", 80);
  const intent = text(formData, "task_intent", 30);
  const values: Record<string, unknown> = {};
  let eventType = "follow_up_updated";
  let message = "Follow-up updated.";
  if (intent === "complete") {
    Object.assign(values, {
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by_user_id: auth.userId,
    });
    eventType = "follow_up_completed";
    message = "Follow-up completed.";
  } else if (intent === "reopen") {
    Object.assign(values, {
      status: "open",
      completed_at: null,
      completed_by_user_id: null,
    });
    eventType = "follow_up_reopened";
    message = "Follow-up reopened.";
  } else if (intent === "start") {
    Object.assign(values, { status: "in_progress" });
    message = "Follow-up marked in progress.";
  } else if (intent === "snooze") {
    const snoozedUntil = dateTime(formData.get("snoozed_until"));
    if (!snoozedUntil)
      return failure("Choose when this follow-up should return.");
    Object.assign(values, { status: "waiting", snoozed_until: snoozedUntil });
    eventType = "follow_up_snoozed";
    message = "Follow-up snoozed.";
  } else return failure("Choose a valid follow-up action.");
  const { data, error } = await auth.supabase
    .from("follow_up_tasks")
    .update(values)
    .eq("id", taskId)
    .select("id, customer_id, organization_id")
    .maybeSingle();
  if (error || !data)
    return failure(error?.message ?? "Follow-up not found or no access.");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType,
    subjectId: taskId,
    subjectType: "follow_up_task",
  });
  revalidateRecurring(data.customer_id, data.organization_id);
  return success(message);
}

export async function createServiceRecommendation(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const locationId = text(formData, "service_location_id", 80);
  const title = text(formData, "title", 180);
  const recommendation = optionalMultiline(
    formData,
    "customer_recommendation",
    5000,
  );
  if (!locationId || !title || !recommendation)
    return failure(
      "Property, title, and customer-ready recommendation are required.",
    );
  const { data: location, error: locationError } = await auth.supabase
    .from("service_locations")
    .select("id, customer_id, organization_id")
    .eq("id", locationId)
    .single();
  if (locationError || !location)
    return failure(locationError?.message ?? "Service location not found.");
  const { data, error } = await auth.supabase
    .from("service_recommendations")
    .insert({
      customer_id: location.customer_id,
      organization_id: location.organization_id,
      organization_contact_id: optional(
        formData,
        "organization_contact_id",
        80,
      ),
      service_location_id: location.id,
      service_category_id: optional(formData, "service_category_id", 80),
      source_job_id: optional(formData, "source_job_id", 80),
      title,
      customer_recommendation: recommendation,
      internal_notes: optionalMultiline(formData, "internal_notes", 5000),
      recommended_timeframe: optional(formData, "recommended_timeframe", 240),
      priority: allowed(text(formData, "priority", 20), priorities, "normal"),
      estimated_value_cents: optionalCents(formData.get("estimated_value")),
      origin: allowed(
        text(formData, "origin", 30),
        recommendationOrigins,
        "office",
      ),
      status: "recommended",
      created_by_user_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data)
    return failure(error?.message ?? "Could not save the recommendation.");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recommendation_submitted",
    subjectId: data.id,
    subjectType: "service_recommendation",
    metadata: { origin: "office" },
  });
  revalidateRecurring(location.customer_id, location.organization_id);
  return success(
    "Recommendation saved for office follow-up. Nothing was sent to the customer.",
  );
}

export async function createTaskFromRecommendation(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const recommendationId = text(formData, "recommendation_id", 80);
  const { data: recommendation, error } = await auth.supabase
    .from("service_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .single();
  if (error || !recommendation)
    return failure(error?.message ?? "Recommendation not found.");
  const dedupeKey = `recommendation-follow-up:${recommendationId}`;
  const { error: taskError } = await auth.supabase
    .from("follow_up_tasks")
    .insert({
      customer_id: recommendation.customer_id,
      organization_id: recommendation.organization_id,
      organization_contact_id: recommendation.organization_contact_id,
      service_location_id: recommendation.service_location_id,
      recommendation_id: recommendationId,
      title: `Review recommendation: ${recommendation.title}`,
      description: recommendation.customer_recommendation,
      task_type: "prepare_quote",
      due_at: dateTime(formData.get("due_at")) ?? new Date().toISOString(),
      priority: recommendation.priority,
      assigned_to_user_id: optional(formData, "assigned_to_user_id", 80),
      dedupe_key: dedupeKey,
      created_by_user_id: auth.userId,
    });
  if (taskError && taskError.code !== "23505")
    return failure(taskError.message);
  await auth.supabase
    .from("service_recommendations")
    .update({
      status: "follow_up_scheduled",
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: auth.userId,
    })
    .eq("id", recommendationId);
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recommendation_reviewed",
    subjectId: recommendationId,
    subjectType: "service_recommendation",
    metadata: { outcome: "follow_up_scheduled" },
  });
  revalidateRecurring(
    recommendation.customer_id,
    recommendation.organization_id,
  );
  return success(
    taskError?.code === "23505"
      ? "An active follow-up already exists for this recommendation."
      : "Recommendation added to the follow-up queue.",
  );
}

export async function createQuoteFromRecommendation(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const recommendationId = text(formData, "recommendation_id", 80);
  const { data: recommendation, error } = await auth.supabase
    .from("service_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .single();
  if (error || !recommendation)
    return failure(error?.message ?? "Recommendation not found.");
  if (recommendation.related_quote_id)
    redirect(`/admin/quotes/${recommendation.related_quote_id}/edit`);

  if ((recommendation.customer_id === null) === (recommendation.organization_id === null))
    return failure("The recommendation must identify exactly one contracting party.");

  const { data: quote, error: quoteError } = await auth.supabase
    .from("quotes")
    .insert({
      customer_id: recommendation.customer_id,
      organization_id: recommendation.organization_id,
      recipient_contact_id: recommendation.organization_contact_id,
      approval_contact_id: recommendation.organization_contact_id,
      service_location_id: recommendation.service_location_id,
      source_recommendation_id: recommendation.id,
      estimator_user_id: auth.userId,
      status: "draft",
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
    })
    .select("id")
    .single();
  if (quoteError?.code === "23505") {
    const { data: existing } = await auth.supabase
      .from("quotes")
      .select("id")
      .eq("source_recommendation_id", recommendation.id)
      .maybeSingle();
    if (existing)
      redirect(`/admin/quotes/${existing.id}/edit?recommendation=1`);
  }
  if (quoteError || !quote)
    return failure(quoteError?.message ?? "Could not prepare the draft quote.");

  const { error: lineError } = await auth.supabase
    .from("quote_line_items")
    .insert({
      quote_id: quote.id,
      name: recommendation.title,
      description: recommendation.customer_recommendation,
      service_category_id: recommendation.service_category_id,
      material_id: null,
      quantity: 1,
      unit_price_cents: 0,
      total_cents: 0,
      sort_order: 0,
    });
  if (lineError) {
    await auth.supabase.from("quotes").delete().eq("id", quote.id);
    return failure(lineError.message);
  }

  await auth.supabase
    .from("service_recommendations")
    .update({
      status: "quote_created",
      related_quote_id: quote.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: auth.userId,
    })
    .eq("id", recommendationId)
    .is("related_quote_id", null);
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recommendation_converted_to_quote",
    subjectId: recommendationId,
    subjectType: "service_recommendation",
    metadata: { quote_id: quote.id },
  });
  redirect(`/admin/quotes/${quote.id}/edit?recommendation=1`);
}

export async function createRecurringServicePlan(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const accountKind = text(formData, "account_kind", 20);
  const accountId = text(formData, "account_id", 80);
  const locationIds = [
    ...new Set(
      formData.getAll("service_location_ids").map(String).filter(Boolean),
    ),
  ];
  const planName = text(formData, "plan_name", 180);
  const description = optionalMultiline(formData, "service_description", 5000);
  const nextServiceDate = dateOnly(formData.get("next_service_due_date"));
  if (
    !accountId ||
    !["customer", "organization"].includes(accountKind) ||
    !planName ||
    !description ||
    !nextServiceDate ||
    !locationIds.length
  )
    return failure(
      "Account, plan name, service description, next date, and at least one property are required.",
    );
  const customerId = accountKind === "customer" ? accountId : null;
  const organizationId = accountKind === "organization" ? accountId : null;
  const accountLookup = customerId
    ? await auth.supabase
        .from("customers")
        .select("id, status")
        .eq("id", customerId)
        .maybeSingle()
    : await auth.supabase
        .from("organizations")
        .select("id, status")
        .eq("id", organizationId as string)
        .maybeSingle();
  if (
    accountLookup.error ||
    !accountLookup.data ||
    accountLookup.data.status !== "active"
  )
    return failure(
      accountLookup.error?.message ?? "The selected account must be active.",
    );
  const { data: locations, error: locationError } = await auth.supabase
    .from("service_locations")
    .select("id, customer_id, organization_id")
    .in("id", locationIds);
  if (locationError || !locations || locations.length !== locationIds.length)
    return failure(
      locationError?.message ?? "One selected property could not be found.",
    );
  if (
    locations.some((location) =>
      customerId
        ? location.customer_id !== customerId
        : location.organization_id !== organizationId,
    )
  )
    return failure(
      "Every selected property must belong to the selected account.",
    );
  const contactIds = [
    optional(formData, "approval_contact_id", 80),
    optional(formData, "billing_contact_id", 80),
    optional(formData, "default_onsite_contact_id", 80),
    optional(formData, "authorized_contact_id", 80),
    ...locationIds.map((locationId) =>
      optional(formData, `onsite_contact_${locationId}`, 80),
    ),
  ].filter(Boolean) as string[];
  const contactError = await validateContacts(
    auth.supabase,
    organizationId,
    contactIds,
  );
  if (contactError) return failure(contactError);
  const recurrencePattern = allowed(
    text(formData, "recurrence_pattern", 30),
    recurrencePatterns,
    "annually",
  );
  const customInterval = integer(formData.get("custom_interval_count"));
  if (
    ["custom_days", "custom_months"].includes(recurrencePattern) &&
    !customInterval
  )
    return failure("Enter the custom recurrence interval.");
  const planningWindow = boundedInteger(
    formData.get("planning_window_days"),
    60,
    0,
    365,
  );
  const quoteLead = boundedInteger(formData.get("quote_lead_days"), 45, 0, 365);
  const { data: plan, error } = await auth.supabase
    .from("recurring_service_plans")
    .insert({
      customer_id: customerId,
      organization_id: organizationId,
      service_category_id: optional(formData, "service_category_id", 80),
      source_quote_id: optional(formData, "source_quote_id", 80),
      source_job_id: optional(formData, "source_job_id", 80),
      source_recommendation_id: optional(
        formData,
        "source_recommendation_id",
        80,
      ),
      plan_name: planName,
      service_description: description,
      recurrence_pattern: recurrencePattern,
      custom_interval_count: customInterval,
      preferred_service_window: optional(
        formData,
        "preferred_service_window",
        500,
      ),
      planning_window_days: planningWindow,
      quote_lead_days: quoteLead,
      reminder_lead_days: boundedInteger(
        formData.get("reminder_lead_days"),
        30,
        0,
        365,
      ),
      authorization_mode: allowed(
        text(formData, "authorization_mode", 30),
        authorizationModes,
        "quote_required",
      ),
      agreement_reference: optional(formData, "agreement_reference", 240),
      authorization_start_date: dateOnly(
        formData.get("authorization_start_date"),
      ),
      authorization_end_date: dateOnly(formData.get("authorization_end_date")),
      authorized_contact_id: optional(formData, "authorized_contact_id", 80),
      approval_contact_id: optional(formData, "approval_contact_id", 80),
      billing_contact_id: optional(formData, "billing_contact_id", 80),
      default_onsite_contact_id: optional(
        formData,
        "default_onsite_contact_id",
        80,
      ),
      default_payment_terms: optional(formData, "default_payment_terms", 160),
      approved_price_cents: optionalCents(formData.get("approved_price")),
      pricing_rule: optional(formData, "pricing_rule", 500),
      estimated_duration_minutes: integer(
        formData.get("estimated_duration_minutes"),
      ),
      preferred_crew_user_id: optional(formData, "preferred_crew_user_id", 80),
      customer_notes: optionalMultiline(formData, "customer_notes", 3000),
      internal_notes: optionalMultiline(formData, "internal_notes", 5000),
      weather_reschedule_allowed:
        formData.get("weather_reschedule_allowed") === "on",
      created_by_user_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !plan)
    return failure(error?.message ?? "Could not create the recurring plan.");
  const nextReviewDate = subtractDays(nextServiceDate, planningWindow);
  const { error: locationsError } = await auth.supabase
    .from("recurring_plan_locations")
    .insert(
      locationIds.map((serviceLocationId) => ({
        recurring_plan_id: plan.id,
        service_location_id: serviceLocationId,
        onsite_contact_id:
          optional(formData, `onsite_contact_${serviceLocationId}`, 80) ??
          optional(formData, "default_onsite_contact_id", 80),
        next_service_due_date: nextServiceDate,
        next_review_date: nextReviewDate,
        preferred_service_window: optional(
          formData,
          "preferred_service_window",
          500,
        ),
      })),
    );
  if (locationsError) {
    await auth.supabase
      .from("recurring_service_plans")
      .update({ state: "cancelled" })
      .eq("id", plan.id);
    return failure(
      `The plan was not activated because its properties could not be saved: ${locationsError.message}`,
    );
  }
  const sourceRecommendationId = optional(
    formData,
    "source_recommendation_id",
    80,
  );
  if (sourceRecommendationId)
    await auth.supabase
      .from("service_recommendations")
      .update({
        status: "quote_planned",
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: auth.userId,
      })
      .eq("id", sourceRecommendationId);
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recurring_plan_created",
    subjectId: plan.id,
    subjectType: "recurring_plan",
    metadata: { location_count: locationIds.length },
  });
  revalidateRecurring(customerId, organizationId);
  redirect(`/admin/recurring/${plan.id}`);
}

export async function generateRecurringOpportunities(
  _state: RecurringActionState,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { data, error } = await auth.supabase
    .rpc("generate_due_recurring_occurrences", { p_limit: 200 })
    .single();
  if (error || !data)
    return failure(
      error?.message ?? "Could not generate renewal opportunities.",
    );
  revalidatePath("/admin/recurring");
  const result = data as { created_count: number; existing_count: number };
  return success(
    result.created_count
      ? `${result.created_count} renewal opportunit${result.created_count === 1 ? "y" : "ies"} created. Existing cycles were not duplicated.`
      : "No new renewal opportunities were due.",
  );
}

export async function updateRecurringPlanState(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const planId = text(formData, "plan_id", 80);
  const state = allowed(
    text(formData, "plan_state", 20),
    ["active", "paused", "cancelled"],
    "paused",
  );
  const { data: current, error: currentError } = await auth.supabase
    .from("recurring_service_plans")
    .select("state")
    .eq("id", planId)
    .maybeSingle();
  if (currentError || !current)
    return failure(currentError?.message ?? "Plan not found or no access.");
  if (current.state === "cancelled")
    return failure("Cancelled plans keep their history and cannot be resumed.");
  const { data, error } = await auth.supabase
    .from("recurring_service_plans")
    .update({ state })
    .eq("id", planId)
    .select("id, customer_id, organization_id")
    .maybeSingle();
  if (error || !data)
    return failure(error?.message ?? "Plan not found or no access.");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType:
      state === "paused"
        ? "recurring_plan_paused"
        : state === "active"
          ? "recurring_plan_resumed"
          : "recurring_plan_cancelled",
    subjectId: planId,
    subjectType: "recurring_plan",
  });
  revalidateRecurring(data.customer_id, data.organization_id, planId);
  return success(`Plan ${state}. Historical occurrences were not changed.`);
}

export async function rescheduleRecurringLocation(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const rowId = text(formData, "plan_location_id", 80);
  const nextDate = dateOnly(formData.get("next_service_due_date"));
  if (!nextDate) return failure("Choose the next service date.");
  const { data: row, error: lookupError } = await auth.supabase
    .from("recurring_plan_locations")
    .select(
      "id, recurring_plan_id, recurring_service_plans(planning_window_days)",
    )
    .eq("id", rowId)
    .single();
  if (lookupError || !row)
    return failure(lookupError?.message ?? "Plan property not found.");
  const relation = one(row.recurring_service_plans) as {
    planning_window_days: number;
  } | null;
  const { error } = await auth.supabase
    .from("recurring_plan_locations")
    .update({
      next_service_due_date: nextDate,
      next_review_date: subtractDays(
        nextDate,
        relation?.planning_window_days ?? 60,
      ),
    })
    .eq("id", rowId);
  if (error) return failure(error.message);
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recurring_location_rescheduled",
    subjectId: row.recurring_plan_id,
    subjectType: "recurring_plan",
    metadata: { plan_location_id: rowId },
  });
  revalidateRecurring(null, null, row.recurring_plan_id);
  return success(
    "Future service date updated. Earlier occurrences were not changed.",
  );
}

export async function updateRecurringLocationState(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const rowId = text(formData, "plan_location_id", 80);
  const state = allowed(
    text(formData, "location_state", 20),
    ["active", "paused"],
    "paused",
  );
  const reason = optionalMultiline(formData, "paused_reason", 1000);
  const { data, error } = await auth.supabase
    .from("recurring_plan_locations")
    .update({
      state,
      paused_reason: state === "paused" ? reason : null,
    })
    .eq("id", rowId)
    .select("id, recurring_plan_id")
    .maybeSingle();
  if (error || !data)
    return failure(error?.message ?? "Plan property not found or no access.");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType:
      state === "paused"
        ? "recurring_location_paused"
        : "recurring_location_resumed",
    subjectId: data.recurring_plan_id,
    subjectType: "recurring_plan",
    metadata: {
      plan_location_id: rowId,
      reason: state === "paused" ? reason : null,
    },
  });
  revalidateRecurring(null, null, data.recurring_plan_id);
  return success(
    state === "paused"
      ? "This property is paused. Other plan properties remain active."
      : "This property is active again.",
  );
}

export async function closeRecurringOccurrence(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const occurrenceId = text(formData, "occurrence_id", 80);
  const status = text(formData, "occurrence_status", 20);
  const reason = optionalMultiline(formData, "reason", 1000);
  const { data, error } = await auth.supabase
    .rpc("close_recurring_occurrence", {
      p_occurrence_id: occurrenceId,
      p_reason: reason,
      p_status: status,
    })
    .single();
  if (error || !data)
    return failure(error?.message ?? "Could not update the occurrence.");
  revalidatePath("/admin/recurring");
  return success(
    status === "completed"
      ? "Occurrence completed and the next date advanced."
      : "Occurrence closed with its history preserved.",
  );
}

export async function createRenewalQuote(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const occurrenceId = text(formData, "occurrence_id", 80);
  const { data: occurrence, error } = await auth.supabase
    .from("recurring_service_occurrences")
    .select(
      "*, recurring_service_plans(*), service_locations(customer_id, organization_id)",
    )
    .eq("id", occurrenceId)
    .single();
  if (error || !occurrence)
    return failure(error?.message ?? "Renewal occurrence not found.");
  if (occurrence.renewal_quote_id)
    redirect(`/admin/quotes/${occurrence.renewal_quote_id}/edit`);
  const plan = one(occurrence.recurring_service_plans) as any;
  const location = one(occurrence.service_locations) as {
    customer_id: string | null;
    organization_id: string | null;
  } | null;
  if (!plan || plan.state !== "active")
    return failure(
      "The recurring plan must be active before preparing a quote.",
    );
  const customerId = plan.customer_id ?? null;
  if ((customerId === null) === (plan.organization_id === null))
    return failure("The recurring plan must identify exactly one contracting party.");
  const sourceQuoteId =
    occurrence.prior_quote_id ?? plan.source_quote_id ?? null;
  const source = sourceQuoteId
    ? await auth.supabase
        .from("quotes")
        .select("*, quote_line_items(*)")
        .eq("id", sourceQuoteId)
        .maybeSingle()
    : { data: null, error: null };
  if (source.error) return failure(source.error.message);
  const sourceLines = ((source.data as any)?.quote_line_items ?? []) as any[];
  const fallbackPrice = plan.approved_price_cents ?? 0;
  const subtotal = sourceLines.length
    ? sourceLines.reduce((sum, line) => sum + line.total_cents, 0)
    : fallbackPrice;
  const { data: quote, error: quoteError } = await auth.supabase
    .from("quotes")
    .insert({
      job_id: null,
      customer_id: customerId,
      organization_id: plan.organization_id,
      recipient_contact_id: plan.approval_contact_id,
      approval_contact_id: plan.approval_contact_id,
      service_location_id: occurrence.service_location_id,
      estimator_user_id: auth.userId,
      status: "draft",
      subtotal_cents: subtotal,
      tax_cents: 0,
      total_cents: subtotal,
      customer_message: plan.customer_notes,
      payment_terms: plan.default_payment_terms,
      recurring_service_plan_id: plan.id,
      recurring_occurrence_id: occurrence.id,
      renewal_source_quote_id: sourceQuoteId,
      pricing_reviewed_at: null,
      pricing_reviewed_by_user_id: null,
    })
    .select("id")
    .single();
  if (quoteError || !quote)
    return failure(
      quoteError?.code === "23505"
        ? "A renewal quote already exists for this occurrence."
        : (quoteError?.message ?? "Could not create the renewal quote."),
    );
  const lines = sourceLines.length
    ? sourceLines.map((line, index) => ({
        quote_id: quote.id,
        name: line.name,
        description: line.description,
        service_category_id: line.service_category_id,
        material_id: line.material_id,
        quantity: line.quantity,
        unit_price_cents: line.unit_price_cents,
        total_cents: line.total_cents,
        sort_order: index,
      }))
    : [
        {
          quote_id: quote.id,
          name: plan.plan_name,
          description: plan.service_description,
          service_category_id: plan.service_category_id,
          material_id: null,
          quantity: 1,
          unit_price_cents: fallbackPrice,
          total_cents: fallbackPrice,
          sort_order: 0,
        },
      ];
  const { error: lineError } = await auth.supabase
    .from("quote_line_items")
    .insert(lines);
  if (lineError) {
    await auth.supabase.from("quotes").delete().eq("id", quote.id);
    return failure(lineError.message);
  }
  await auth.supabase
    .from("recurring_service_occurrences")
    .update({
      renewal_quote_id: quote.id,
      status: "quote_draft",
      assigned_estimator_user_id: auth.userId,
      pricing_review_status: "required",
    })
    .eq("id", occurrence.id)
    .is("renewal_quote_id", null);
  if (plan.source_recommendation_id) {
    await auth.supabase
      .from("service_recommendations")
      .update({
        status: "quote_created",
        related_quote_id: quote.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: auth.userId,
      })
      .eq("id", plan.source_recommendation_id)
      .in("status", [
        "recommended",
        "pending_office_review",
        "follow_up_scheduled",
        "quote_planned",
      ]);
  }
  await auth.supabase
    .from("follow_up_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by_user_id: auth.userId,
    })
    .eq("recurring_occurrence_id", occurrence.id)
    .eq("task_type", "renew_service")
    .neq("status", "completed");
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "renewal_quote_created",
    subjectId: occurrence.id,
    subjectType: "recurring_occurrence",
    metadata: { quote_id: quote.id, source_quote_id: sourceQuoteId },
  });
  redirect(`/admin/quotes/${quote.id}/edit?renewal=1`);
}

export async function createAuthorizedRecurringWorkOrder(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const occurrenceId = text(formData, "occurrence_id", 80);
  const { data: occurrence, error } = await auth.supabase
    .from("recurring_service_occurrences")
    .select(
      "*, recurring_service_plans(*), service_locations(customer_id, organization_id)",
    )
    .eq("id", occurrenceId)
    .single();
  if (error || !occurrence)
    return failure(error?.message ?? "Occurrence not found.");
  if (occurrence.work_order_id)
    redirect(`/admin/jobs/${occurrence.work_order_id}`);
  const plan = one(occurrence.recurring_service_plans) as any;
  const location = one(occurrence.service_locations) as any;
  if (
    !plan ||
    plan.authorization_mode !== "existing_agreement" ||
    !plan.agreement_reference
  )
    return failure(
      "This plan requires a quote or staff review before work can be created.",
    );
  const today = new Date().toISOString().slice(0, 10);
  if (
    (plan.authorization_start_date && plan.authorization_start_date > today) ||
    (plan.authorization_end_date && plan.authorization_end_date < today)
  )
    return failure("The recurring authorization is not currently active.");
  const customerId = plan.customer_id ?? null;
  if ((customerId === null) === (plan.organization_id === null))
    return failure("The recurring plan must identify exactly one contracting party.");
  const { data: job, error: jobError } = await auth.supabase
    .from("jobs")
    .insert({
      customer_id: customerId,
      organization_id: plan.organization_id,
      service_location_id: occurrence.service_location_id,
      onsite_contact_id: plan.default_onsite_contact_id,
      property_manager_contact_id: plan.approval_contact_id ?? plan.authorized_contact_id,
      status: "accepted",
      service_type: "other",
      requested_scope: plan.service_description,
      priority: "normal",
      projected_value_cents: plan.approved_price_cents ?? 0,
      recurring_service_plan_id: plan.id,
      recurring_occurrence_id: occurrence.id,
      recurring_authorization_source: plan.agreement_reference,
    })
    .select("id")
    .single();
  if (jobError || !job)
    return failure(
      jobError?.code === "23505"
        ? "A work order already exists for this occurrence."
        : (jobError?.message ?? "Could not create the work order."),
    );
  await auth.supabase
    .from("recurring_service_occurrences")
    .update({ work_order_id: job.id, status: "approved" })
    .eq("id", occurrence.id)
    .is("work_order_id", null);
  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "recurring_work_order_generated",
    subjectId: occurrence.id,
    subjectType: "recurring_occurrence",
    metadata: { job_id: job.id, authorization: "existing_agreement" },
  });
  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs/${job.id}`);
}

async function requireStaff() {
  const supabase = await createClient();
  if (!supabase) return { error: failure("Supabase is not configured.") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: failure("Sign in before managing recurring service operations."),
    };
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff))
    return {
      error: failure(
        "Only authorized office staff can manage recurring service operations.",
      ),
    };
  return { error: null, supabase, userId: user.id };
}

async function resolveSubject(supabase: any, formData: FormData) {
  const customerId = optional(formData, "customer_id", 80);
  const organizationId = optional(formData, "organization_id", 80);
  const locationId = optional(formData, "service_location_id", 80);
  const values = {
    customer_id: customerId,
    organization_id: organizationId,
    organization_contact_id: optional(formData, "organization_contact_id", 80),
    service_location_id: locationId,
    quote_id: optional(formData, "quote_id", 80),
    change_order_id: optional(formData, "change_order_id", 80),
    job_id: optional(formData, "job_id", 80),
    invoice_id: optional(formData, "invoice_id", 80),
    recurring_plan_id: optional(formData, "recurring_plan_id", 80),
    recommendation_id: optional(formData, "recommendation_id", 80),
  };
  if (!Object.values(values).some(Boolean))
    return {
      values,
      error: "Link the follow-up to an account, property, or CRM record.",
    };
  if (locationId) {
    const { data, error } = await supabase
      .from("service_locations")
      .select("customer_id, organization_id")
      .eq("id", locationId)
      .single();
    if (error || !data)
      return { values, error: error?.message ?? "Property not found." };
    values.customer_id ||= data.customer_id;
    values.organization_id ||= data.organization_id;
  }
  return { values, error: null };
}

async function validateContacts(
  supabase: any,
  organizationId: string | null,
  ids: string[],
) {
  if (!ids.length) return null;
  if (!organizationId)
    return "Organization contacts can only be used on an organization plan.";
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await supabase
    .from("organization_contacts")
    .select("id, organization_id, is_active")
    .in("id", uniqueIds);
  if (error) return error.message;
  if (
    (data ?? []).length !== uniqueIds.length ||
    data?.some(
      (row: any) => row.organization_id !== organizationId || !row.is_active,
    )
  )
    return "Every selected contact must be active and belong to this organization.";
  return null;
}

function revalidateRecurring(
  customerId?: string | null,
  organizationId?: string | null,
  planId?: string,
) {
  revalidatePath("/admin/recurring");
  if (planId) revalidatePath(`/admin/recurring/${planId}`);
  if (customerId) revalidatePath(`/admin/customers/${customerId}`);
  if (organizationId) revalidatePath(`/admin/organizations/${organizationId}`);
}
function success(message: string): RecurringActionState {
  return { status: "success", message };
}
function failure(message: string): RecurringActionState {
  return { status: "error", message };
}
function text(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}
function optional(formData: FormData, key: string, max: number) {
  return text(formData, key, max) || null;
}
function optionalMultiline(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
  return value || null;
}
function dateOnly(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
function dateTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function integer(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function boundedInteger(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
}
function optionalCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : null;
}
function subtractDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function allowed<T extends string>(
  value: string,
  values: readonly T[],
  fallback: T,
): T {
  return values.includes(value as T) ? (value as T) : fallback;
}
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
const priorities = ["low", "normal", "high", "urgent"] as const;
const taskTypes = [
  "call_customer",
  "schedule_estimate",
  "prepare_quote",
  "follow_up_quote",
  "schedule_approved_work",
  "collect_information",
  "request_payment",
  "renew_service",
  "property_inspection",
  "customer_callback",
  "internal_review",
  "other",
] as const;
const recommendationOrigins = [
  "office",
  "estimate",
  "closeout",
  "inspection",
  "customer_request",
] as const;
const recurrencePatterns = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "twice_yearly",
  "annually",
  "custom_days",
  "custom_months",
  "seasonal_manual",
] as const;
const authorizationModes = [
  "quote_required",
  "staff_review",
  "existing_agreement",
] as const;
