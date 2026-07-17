// Manual Phase 2 types that match supabase/migrations/0001_initial_platform_schema.sql.
// Replace these with generated Supabase types after the project has a stable Supabase CLI workflow.

export type CustomerType = "residential" | "commercial" | "property_manager" | "hoa";
export type CustomerStatus = "active" | "inactive" | "archived";

export type JobStatus =
  | "new_lead"
  | "estimate_scheduled"
  | "quoted"
  | "accepted"
  | "scheduled"
  | "in_progress"
  | "returned_for_correction"
  | "completed_pending_review"
  | "ready_to_invoice"
  | "completed"
  | "invoiced"
  | "paid"
  | "lost"
  | "cancelled";

export type JobServiceType =
  | "tree_removal"
  | "trimming"
  | "stump_grinding"
  | "landscaping"
  | "lawn_care"
  | "emergency"
  | "other";

export type JobPriority = "normal" | "urgent" | "emergency";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "approved"
  | "change_requested"
  | "expired"
  | "declined"
  | "cancelled";

export type QuoteSentMethod = "crm_email" | "manual" | "printed" | "text" | "other";
export type ChangeOrderStatus =
  | "draft"
  | "pending_internal_review"
  | "ready_to_send"
  | "sent"
  | "approved"
  | "declined"
  | "change_requested"
  | "cancelled"
  | "expired";
export type ChangeOrderApprovalMethod = "portal" | "phone" | "email" | "in_person" | "signed_paper" | "other";

export type AppointmentType = "estimate" | "job" | "follow_up" | "maintenance" | "other";
export type AppointmentStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
export type ScheduleEventType =
  | "estimate"
  | "job"
  | "follow_up"
  | "maintenance"
  | "pto"
  | "unavailable"
  | "internal"
  | "emergency"
  | "other";
export type ScheduleEventStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void" | "overdue";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "cancelled";
export type JobPhotoType = "before" | "during" | "after" | "customer_upload" | "estimate" | "job" | "issue" | "completion" | "equipment_access";
export type JobPhotoUploadCategory = "before" | "during" | "after" | "issue" | "completion" | "equipment_access";
export type JobCloseoutStatus = "draft" | "submitted" | "returned" | "approved" | "ready_to_invoice";
export type CloseoutChecklistStatus = "pending" | "complete" | "not_applicable";
export type CloseoutScopeState = "completed" | "partially_completed" | "not_completed" | "change_required";
export type CustomerAcknowledgmentStatus = "acknowledged" | "customer_not_present" | "customer_declined";
export type OrganizationType = "property_manager" | "hoa" | "commercial" | "nonprofit" | "church" | "municipality" | "general_contractor" | "apartment_community" | "real_estate" | "other";
export type TimeEntryType = "job" | "drive" | "shop" | "maintenance" | "admin" | "training" | "break" | "other";
export type TimeEntryStatus = "active" | "completed" | "adjusted" | "void";
export type TimeEntryReviewStatus = "approved" | "needs_correction" | "rejected";
export type PayPeriodStatus = "open" | "review" | "approved" | "exported" | "locked";
export type EmployeeAccessRequestStatus = "pending" | "approved" | "rejected";
export type EmployeeAccessAssignedRole = "admin" | "estimator" | "crew" | "payroll_admin";
export type EmailEventType =
  | "access_request_admin_notice"
  | "access_approved"
  | "access_rejected"
  | "lead_internal_notice"
  | "quote"
  | "invoice"
  | "change_order"
  | "password_reset_admin_triggered"
  | "estimate_confirmation"
  | "estimate_reminder"
  | "quote_follow_up"
  | "work_confirmation"
  | "work_reminder"
  | "invoice_payment_reminder"
  | "overdue_invoice_reminder"
  | "payment_confirmation";
export type EmailEventStatus = "sent" | "failed";
export type CommunicationType = Extract<
  EmailEventType,
  | "estimate_confirmation"
  | "estimate_reminder"
  | "quote_follow_up"
  | "work_confirmation"
  | "work_reminder"
  | "invoice_payment_reminder"
  | "overdue_invoice_reminder"
  | "payment_confirmation"
>;
export type CommunicationStatus = "pending" | "processing" | "sent" | "skipped" | "failed" | "cancelled";
export type CommunicationRecipientSource = "customer" | "organization";
export type EquipmentCategory =
  | "vehicle"
  | "chipper"
  | "stump_grinder"
  | "skid_steer"
  | "crane"
  | "aerial_lift"
  | "trailer"
  | "chainsaw"
  | "climbing_gear"
  | "rigging_gear"
  | "ppe"
  | "landscaping_equipment"
  | "lawn_care_equipment"
  | "other";
export type EquipmentStatus =
  | "available"
  | "assigned"
  | "in_use"
  | "maintenance_due"
  | "out_of_service"
  | "awaiting_parts"
  | "repair_scheduled"
  | "retired";
export type EquipmentInspectionResult = "passed" | "passed_with_attention" | "failed";

export type Organization = {
  id: string;
  name: string;
  organization_type: OrganizationType;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  payment_terms: string | null;
  tax_exempt: boolean;
  tax_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationContact = {
  id: string;
  organization_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  receives_invoices: boolean;
  receives_job_updates: boolean;
  contact_roles: string[];
  preferred_contact_method: "email" | "phone" | "text" | "other" | null;
  is_active: boolean;
  notes: string | null;
  service_location_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadSource = {
  id: string;
  name: string;
  source_type: "website" | "phone" | "referral" | "google" | "social" | "repeat_customer" | "manual" | "other";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  organization_id: string | null;
  lead_source_id: string | null;
  lead_campaign: string | null;
  display_name: string;
  customer_type: CustomerType;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
};

export type ServiceLocation = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  label: string | null;
  street: string;
  city: string;
  state: string;
  postal_code: string | null;
  access_notes: string | null;
  gate_code: string | null;
  service_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  legacy_customer_id: string | null;
  service_location_id: string;
  source_quote_id: string | null;
  lead_source_id: string | null;
  lead_campaign: string | null;
  assigned_crew_user_id: string | null;
  status: JobStatus;
  service_type: JobServiceType | string | null;
  priority: JobPriority;
  requested_scope: string | null;
  internal_notes: string | null;
  debris_handling: string | null;
  debris_handling_notes: string | null;
  projected_value_cents: number;
  recurring_service_plan_id: string | null;
  recurring_occurrence_id: string | null;
  recurring_authorization_source: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  completed_at: string | null;
  started_at: string | null;
  started_by_user_id: string | null;
  completed_by_user_id: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: string;
  job_id: string | null;
  customer_id: string | null;
  organization_id: string | null;
  legacy_customer_id: string | null;
  recipient_contact_id: string | null;
  approval_contact_id: string | null;
  onsite_contact_id: string | null;
  billing_contact_id: string | null;
  purchase_order_reference: string | null;
  payment_terms: string | null;
  recurring_service_plan_id: string | null;
  recurring_occurrence_id: string | null;
  source_recommendation_id: string | null;
  renewal_source_quote_id: string | null;
  pricing_reviewed_at: string | null;
  pricing_reviewed_by_user_id: string | null;
  service_location_id: string | null;
  estimate_schedule_event_id: string | null;
  status: QuoteStatus;
  quote_number: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_message: string | null;
  debris_handling: string | null;
  debris_handling_notes: string | null;
  sent_at: string | null;
  sent_method: QuoteSentMethod | null;
  sent_by_user_id: string | null;
  estimator_user_id: string | null;
  automatic_follow_ups_enabled: boolean;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
  service_category_id: string | null;
  material_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuotePortalToken = {
  id: string;
  quote_id: string;
  customer_id: string | null;
  organization_id: string | null;
  token_hash: string;
  token_encrypted: string | null;
  token_hint: string | null;
  expires_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoicePortalToken = {
  id: string;
  invoice_id: string;
  customer_id: string | null;
  organization_id: string | null;
  token_hash: string;
  token_encrypted: string | null;
  token_hint: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  job_id: string;
  quote_id: string | null;
  customer_id: string | null;
  organization_id: string | null;
  legacy_customer_id: string | null;
  service_location_id: string | null;
  billing_contact_id: string | null;
  accounts_payable_contact_id: string | null;
  purchase_order_reference: string | null;
  payment_terms: string | null;
  recurring_service_plan_id: string | null;
  recurring_occurrence_id: string | null;
  status: InvoiceStatus;
  invoice_number: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  balance_due_cents: number;
  due_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  automatic_reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  service_category_id: string | null;
  material_id: string | null;
  source_change_order_line_item_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChangeOrder = {
  id: string;
  change_order_number: string;
  source_quote_id: string | null;
  job_id: string | null;
  source_closeout_id: string | null;
  customer_id: string | null;
  organization_id: string | null;
  service_location_id: string | null;
  requested_by_contact_id: string | null;
  approval_contact_id: string | null;
  created_by_user_id: string;
  internally_reviewed_by_user_id: string | null;
  approved_by_contact_id: string | null;
  approved_by_name: string | null;
  approval_recorded_by_user_id: string | null;
  invoice_id: string | null;
  title: string;
  reason: string | null;
  customer_description: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  status: ChangeOrderStatus;
  subtotal_cents: number;
  tax_cents: number;
  fee_cents: number;
  total_cents: number;
  original_approved_amount_cents: number;
  expires_at: string | null;
  internally_reviewed_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  applied_to_job_at: string | null;
  approval_method: ChangeOrderApprovalMethod | null;
  approval_notes: string | null;
  schedule_impact: Record<string, boolean | string | null>;
  created_at: string;
  updated_at: string;
};

export type ChangeOrderLineItem = {
  id: string;
  change_order_id: string;
  service_category_id: string | null;
  material_id: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price_cents: number;
  amount_cents: number;
  internal_cost_estimate_cents: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChangeOrderPortalToken = {
  id: string;
  change_order_id: string;
  customer_id: string | null;
  organization_id: string | null;
  intended_contact_id: string | null;
  token_hash: string;
  token_hint: string | null;
  token_encrypted: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeOrderWithRelations = ChangeOrder & {
  change_order_line_items?: ChangeOrderLineItem[];
  customers?: Pick<Customer, "id" | "display_name" | "email" | "phone"> | null;
  organizations?: Pick<Organization, "id" | "name" | "billing_email" | "billing_address" | "payment_terms"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code"> | null;
  approval_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  requested_by_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  jobs?: Pick<Job, "id" | "status" | "service_type" | "requested_scope" | "source_quote_id"> | null;
  source_quote?: Pick<Quote, "id" | "quote_number" | "total_cents" | "approved_at"> | null;
  invoices?: Pick<Invoice, "id" | "invoice_number" | "status"> | null;
};

export type CrewChangeOrderScopeItem = {
  change_order_id: string;
  change_order_number: string;
  title: string;
  description: string | null;
  sort_order: number;
  approved_at: string;
};

export type FollowUpTaskStatus = "open" | "in_progress" | "waiting" | "completed" | "cancelled";
export type FollowUpTaskType = "call_customer" | "schedule_estimate" | "prepare_quote" | "follow_up_quote" | "schedule_approved_work" | "collect_information" | "request_payment" | "renew_service" | "property_inspection" | "customer_callback" | "internal_review" | "other";
export type RecurringPlanState = "active" | "paused" | "cancelled" | "expired";
export type RecurringOccurrenceStatus = "upcoming" | "review_needed" | "quote_draft" | "quote_sent" | "approved" | "scheduled" | "completed" | "skipped" | "declined" | "cancelled";

export type ServiceRecommendation = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  organization_contact_id: string | null;
  service_location_id: string;
  service_category_id: string | null;
  source_job_id: string | null;
  source_closeout_id: string | null;
  title: string;
  customer_recommendation: string;
  internal_notes: string | null;
  recommended_timeframe: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  estimated_value_cents: number | null;
  origin: "crew" | "office" | "estimate" | "closeout" | "inspection" | "customer_request";
  status: "recommended" | "pending_office_review" | "follow_up_scheduled" | "quote_planned" | "quote_created" | "accepted" | "declined" | "deferred" | "completed" | "cancelled";
  related_quote_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringServicePlan = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  service_category_id: string | null;
  source_quote_id: string | null;
  source_job_id: string | null;
  source_recommendation_id: string | null;
  plan_name: string;
  service_description: string;
  recurrence_pattern: "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "twice_yearly" | "annually" | "custom_days" | "custom_months" | "seasonal_manual";
  custom_interval_count: number | null;
  preferred_service_window: string | null;
  planning_window_days: number;
  quote_lead_days: number;
  reminder_lead_days: number;
  authorization_mode: "quote_required" | "staff_review" | "existing_agreement";
  agreement_reference: string | null;
  authorization_start_date: string | null;
  authorization_end_date: string | null;
  authorized_contact_id: string | null;
  approval_contact_id: string | null;
  billing_contact_id: string | null;
  default_onsite_contact_id: string | null;
  default_payment_terms: string | null;
  approved_price_cents: number | null;
  pricing_rule: string | null;
  estimated_duration_minutes: number | null;
  preferred_crew_user_id: string | null;
  standard_scope: unknown[];
  material_requirements: unknown[];
  equipment_requirements: unknown[];
  season_start_month: number | null;
  season_end_month: number | null;
  weather_reschedule_allowed: boolean;
  customer_notes: string | null;
  internal_notes: string | null;
  state: RecurringPlanState;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type RecurringPlanLocation = {
  id: string;
  recurring_plan_id: string;
  service_location_id: string;
  onsite_contact_id: string | null;
  next_review_date: string | null;
  next_service_due_date: string;
  preferred_service_window: string | null;
  property_notes: string | null;
  access_instructions: string | null;
  state: "active" | "paused" | "removed";
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringServiceOccurrence = {
  id: string;
  recurring_plan_id: string;
  recurring_plan_location_id: string;
  service_location_id: string;
  occurrence_key: string;
  target_service_date: string;
  target_window_start: string | null;
  target_window_end: string | null;
  status: RecurringOccurrenceStatus;
  prior_quote_id: string | null;
  prior_work_order_id: string | null;
  renewal_quote_id: string | null;
  work_order_id: string | null;
  assigned_estimator_user_id: string | null;
  authorization_mode_snapshot: string;
  authorization_reference_snapshot: string | null;
  approved_price_cents_snapshot: number | null;
  pricing_review_status: "required" | "reviewed" | "not_applicable";
  review_notes: string | null;
  skip_reason: string | null;
  generated_at: string;
  completed_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowUpTask = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  organization_contact_id: string | null;
  service_location_id: string | null;
  quote_id: string | null;
  change_order_id: string | null;
  job_id: string | null;
  invoice_id: string | null;
  recurring_plan_id: string | null;
  recurring_occurrence_id: string | null;
  recommendation_id: string | null;
  title: string;
  description: string | null;
  task_type: FollowUpTaskType;
  due_at: string;
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to_user_id: string | null;
  status: FollowUpTaskStatus;
  completed_at: string | null;
  completed_by_user_id: string | null;
  snoozed_until: string | null;
  notes: string | null;
  dedupe_key: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringPlanWithRelations = RecurringServicePlan & {
  customers?: Pick<Customer, "id" | "display_name" | "status"> | null;
  organizations?: Pick<Organization, "id" | "name" | "status"> | null;
  service_categories?: Pick<ServiceCategory, "id" | "label"> | null;
  recurring_plan_locations?: (RecurringPlanLocation & { service_locations?: ServiceLocation | null; onsite_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null })[];
};

export type RecurringOccurrenceWithRelations = RecurringServiceOccurrence & {
  recurring_service_plans?: Pick<RecurringServicePlan, "id" | "plan_name" | "customer_id" | "organization_id" | "authorization_mode" | "state"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code"> | null;
  renewal_quote?: Pick<Quote, "id" | "quote_number" | "status" | "total_cents"> | null;
  work_order?: Pick<Job, "id" | "status" | "service_type"> | null;
};

export type FollowUpTaskWithRelations = FollowUpTask & {
  customers?: Pick<Customer, "id" | "display_name"> | null;
  organizations?: Pick<Organization, "id" | "name"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city"> | null;
  assigned_profile?: AssignableUser | null;
};

export type ServiceRecommendationWithRelations = ServiceRecommendation & {
  customers?: Pick<Customer, "id" | "display_name"> | null;
  organizations?: Pick<Organization, "id" | "name"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city"> | null;
  service_categories?: Pick<ServiceCategory, "id" | "label"> | null;
};

export type Payment = {
  id: string;
  invoice_id: string;
  customer_id: string | null;
  organization_id: string | null;
  amount_cents: number;
  currency: string;
  payment_method: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
  provider_charge_id: string | null;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  job_id: string;
  service_location_id: string;
  assigned_user_id: string | null;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string | null;
  calendar_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignableUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type ScheduleUser = AssignableUser & {
  role_names: string[];
};

export type ScheduleEvent = {
  id: string;
  job_id: string | null;
  service_location_id: string | null;
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location_label: string | null;
  calendar_notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleEventAssignment = {
  event_id: string;
  user_id: string;
  assignment_role: string;
  created_at: string;
};

export type TimeClockPermission = {
  user_id: string;
  is_enabled: boolean;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeAccessRequest = {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  requested_role: string | null;
  note: string | null;
  status: EmployeeAccessRequestStatus;
  assigned_role: EmployeeAccessAssignedRole | null;
  time_clock_enabled: boolean;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailEvent = {
  id: string;
  related_customer_id: string | null;
  related_job_id: string | null;
  related_quote_id: string | null;
  related_invoice_id: string | null;
  related_organization_id: string | null;
  related_schedule_event_id: string | null;
  related_appointment_id: string | null;
  related_payment_id: string | null;
  related_communication_id: string | null;
  recipient_email: string;
  subject: string;
  email_type: EmailEventType;
  status: EmailEventStatus;
  provider_message_id: string | null;
  error_message: string | null;
  sent_by_user_id: string | null;
  created_at: string;
  sent_at: string | null;
};

export type CommunicationSettings = {
  singleton: boolean;
  automated_sending_enabled: boolean;
  business_timezone: string;
  minimum_send_interval_hours: number;
  estimate_confirmation_enabled: boolean;
  estimate_reminder_enabled: boolean;
  estimate_reminder_hours_before: number;
  work_confirmation_enabled: boolean;
  work_reminder_enabled: boolean;
  work_reminder_hours_before: number;
  quote_follow_up_enabled: boolean;
  quote_first_follow_up_days: number;
  quote_second_follow_up_days: number;
  invoice_reminder_enabled: boolean;
  invoice_first_reminder_days: number;
  invoice_second_reminder_days: number;
  payment_confirmation_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerCommunication = {
  id: string;
  communication_type: CommunicationType;
  reminder_stage: string;
  customer_id: string | null;
  organization_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  appointment_id: string | null;
  payment_id: string | null;
  recipient_source: CommunicationRecipientSource;
  recipient_email: string;
  scheduled_for: string;
  source_version: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  processing_started_at: string | null;
  status: CommunicationStatus;
  is_automatic: boolean;
  provider_message_id: string | null;
  attempt_count: number;
  last_error: string | null;
  skip_reason: string | null;
  idempotency_key: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  job_id: string | null;
  schedule_event_id: string | null;
  entry_type: TimeEntryType;
  status: TimeEntryStatus;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntryAdjustment = {
  id: string;
  time_entry_id: string;
  adjusted_by_user_id: string;
  original_clock_in_at: string;
  original_clock_out_at: string | null;
  original_break_minutes: number;
  new_clock_in_at: string;
  new_clock_out_at: string | null;
  new_break_minutes: number;
  reason: string | null;
  created_at: string;
};

export type TimeEntryApproval = {
  id: string;
  time_entry_id: string;
  approved_by_user_id: string;
  approval_status: TimeEntryReviewStatus;
  approval_note: string | null;
  approved_at: string;
  created_at: string;
};

export type PayPeriod = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: PayPeriodStatus;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  customer_id: string | null;
  service_location_id: string | null;
  job_id: string | null;
  author_user_id: string | null;
  visibility: "internal" | "customer_visible" | "crew_visible";
  body: string;
  created_at: string;
  updated_at: string;
};

export type JobPhoto = {
  id: string;
  job_id: string;
  uploaded_by_user_id: string | null;
  photo_type: JobPhotoType;
  storage_path: string;
  caption: string | null;
  created_at: string;
  updated_at: string;
};

export type JobCloseout = {
  id: string;
  change_order_id: string | null;
  job_id: string;
  status: JobCloseoutStatus;
  crew_internal_notes: string | null;
  customer_summary: string | null;
  incident_occurred: boolean | null;
  incident_description: string | null;
  additional_work_requested: boolean | null;
  additional_work_description: string | null;
  future_work_recommended: boolean | null;
  future_work_description: string | null;
  future_work_timeframe: string | null;
  acknowledgment_status: CustomerAcknowledgmentStatus | null;
  acknowledgment_name: string | null;
  acknowledged_at: string | null;
  acknowledgment_collected_by_user_id: string | null;
  has_scope_exception: boolean;
  has_incident: boolean;
  has_additional_work: boolean;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  review_notes: string | null;
  reopened_at: string | null;
  reopened_by_user_id: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type JobCloseoutChecklistItem = {
  id: string;
  job_id: string;
  item_key: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  allow_not_applicable: boolean;
  completion_status: CloseoutChecklistStatus;
  explanation: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JobCloseoutScopeItem = {
  id: string;
  job_id: string;
  source_key: string;
  quote_line_item_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  completion_state: CloseoutScopeState | null;
  exception_note: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JobCloseoutSubmission = {
  id: string;
  closeout_id: string;
  revision_number: number;
  submitted_by_user_id: string | null;
  snapshot_json: Record<string, unknown>;
  submitted_at: string;
};

export type JobCloseoutBundle = {
  closeout: JobCloseout;
  checklist: JobCloseoutChecklistItem[];
  scopeItems: JobCloseoutScopeItem[];
  submissions: JobCloseoutSubmission[];
};

export type SignedJobPhoto = JobPhoto & {
  signed_url: string | null;
};

export type CustomerWithLocations = Customer & {
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code">[];
};

export type JobWithRelations = Job & {
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  organizations?: Pick<Organization, "id" | "name" | "billing_email" | "billing_phone"> | null;
  service_locations?: Pick<
    ServiceLocation,
    "id" | "label" | "street" | "city" | "state" | "postal_code" | "access_notes" | "service_notes"
  > | null;
};

export type CrewJob = Pick<
  Job,
  | "id"
  | "assigned_crew_user_id"
  | "status"
  | "service_type"
  | "priority"
  | "requested_scope"
  | "scheduled_start_at"
  | "scheduled_end_at"
  | "completed_at"
  | "started_at"
  | "started_by_user_id"
  | "completed_by_user_id"
  | "created_at"
  | "updated_at"
> & {
  customers?: Pick<Customer, "display_name" | "phone"> | null;
  organizations?: Pick<Organization, "name" | "billing_phone"> | null;
  service_locations?: Pick<
    ServiceLocation,
    | "label"
    | "street"
    | "city"
    | "state"
    | "postal_code"
    | "access_notes"
    | "gate_code"
    | "service_notes"
  > | null;
  job_photos?: Pick<JobPhoto, "photo_type">[];
  notes?: Pick<Note, "id" | "visibility" | "body" | "created_at">[];
};

export type QuoteWithRelations = Quote & {
  jobs?: Pick<Job, "id" | "status" | "service_type"> | null;
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  organizations?: Pick<Organization, "id" | "name" | "billing_email" | "billing_phone" | "billing_address"> | null;
  recipient_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  approval_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  onsite_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  billing_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  service_locations?: Pick<
    ServiceLocation,
    "id" | "label" | "street" | "city" | "state" | "postal_code" | "access_notes" | "service_notes"
  > | null;
  schedule_events?: Pick<ScheduleEvent, "id" | "title" | "event_type" | "starts_at" | "ends_at"> | null;
  quote_line_items?: QuoteLineItem[];
};

export type InvoiceWithRelations = Invoice & {
  jobs?: Pick<Job, "id" | "status" | "service_type" | "requested_scope"> | null;
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  organizations?: Pick<Organization, "id" | "name" | "billing_email" | "billing_phone" | "billing_address"> | null;
  billing_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  accounts_payable_contact?: Pick<OrganizationContact, "id" | "full_name" | "email" | "phone" | "is_active"> | null;
  invoice_line_items?: InvoiceLineItem[];
  payments?: Payment[];
};

export type ScheduleLinkedJobSummary = Pick<Job, "id" | "customer_id" | "organization_id" | "status" | "service_type" | "requested_scope"> & {
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  organizations?: Pick<Organization, "id" | "name" | "billing_phone" | "billing_email"> | null;
};

export type ScheduleLocationSummary = Pick<
  ServiceLocation,
  "id" | "label" | "street" | "city" | "state" | "postal_code" | "access_notes" | "service_notes"
>;

export type AppointmentWithRelations = Appointment & {
  jobs?: ScheduleLinkedJobSummary | null;
  service_locations?: ScheduleLocationSummary | null;
  profiles?: AssignableUser | null;
};

export type ScheduleEventAssignmentWithUser = ScheduleEventAssignment & {
  profiles?: AssignableUser | null;
};

export type ScheduleEventWithRelations = ScheduleEvent & {
  jobs?: ScheduleLinkedJobSummary | null;
  service_locations?: ScheduleLocationSummary | null;
  schedule_event_assignments?: ScheduleEventAssignmentWithUser[];
  equipment_assignments?: (EquipmentAssignment & {
    equipment_assets?: Pick<EquipmentAsset, "id" | "asset_number" | "name" | "status" | "category"> | null;
  })[];
};

export type CalendarEntrySource = "appointment" | "schedule_event";

export type CalendarEntry = {
  id: string;
  source: CalendarEntrySource;
  title: string;
  subtitle: string;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location_label: string | null;
  calendar_notes: string | null;
  job_id: string | null;
  service_location_id: string | null;
  assignees: AssignableUser[];
  customer_label?: string | null;
};

export type TimeEntryWithRelations = TimeEntry & {
  profiles?: Pick<AssignableUser, "id" | "full_name" | "email"> | null;
  jobs?: Pick<Job, "id" | "service_type" | "status"> & {
    customers?: Pick<Customer, "display_name"> | null;
    organizations?: Pick<Organization, "name"> | null;
  } | null;
  schedule_events?: Pick<ScheduleEvent, "id" | "title" | "event_type" | "starts_at" | "ends_at"> | null;
  time_entry_adjustments?: TimeEntryAdjustment[];
  time_entry_approvals?: TimeEntryApproval[];
};

export type TimeClockUserSummary = AssignableUser & {
  role_names: string[];
  is_time_clock_role_eligible?: boolean;
  time_clock_permission?: TimeClockPermission | null;
  time_clock_permission_changed_at?: string | null;
  time_clock_permission_set_by_label?: string | null;
  active_timer_entry_id?: string | null;
  active_timer_entry_type?: TimeEntryType | null;
  active_timer_started_at?: string | null;
  active_timer_work_label?: string | null;
};

export type PayrollWarningKind =
  | "active_previous_day"
  | "long_shift"
  | "missing_clock_out"
  | "missing_linked_work"
  | "overlap"
  | "short_duration"
  | "invalid_duration";

export type PayrollWarning = {
  id: string;
  kind: PayrollWarningKind;
  title: string;
  detail: string;
  user_id: string | null;
  time_entry_id: string | null;
};

export type PayrollEmployeeSummary = {
  user_id: string;
  employee_label: string;
  entry_count: number;
  total_hours: number;
  regular_hours: number;
  job_hours: number;
  drive_hours: number;
  shop_hours: number;
  maintenance_hours: number;
  admin_hours: number;
  missing_clock_out_count: number;
  adjusted_count: number;
  pending_review_count: number;
  approved_count: number;
  needs_correction_count: number;
  rejected_count: number;
  entries: TimeEntryWithRelations[];
};

export type PayrollReviewSummary = {
  adjusted_count: number;
  approved_count: number;
  entries_missing_clock_out: number;
  job_hours: number;
  maintenance_hours: number;
  pending_review_count: number;
  regular_hours: number;
  total_hours: number;
  drive_hours: number;
  shop_hours: number;
  admin_hours: number;
};

export type PayrollReviewData = {
  employee_summaries: PayrollEmployeeSummary[];
  entries: TimeEntryWithRelations[];
  pay_periods: PayPeriod[];
  selected_pay_period: PayPeriod | null;
  summary: PayrollReviewSummary;
  warnings: PayrollWarning[];
};

export type ScheduleConflictKind =
  | "overlap"
  | "unassigned_job"
  | "missing_end_time"
  | "missing_linked_job";

export type ScheduleConflict = {
  id: string;
  kind: ScheduleConflictKind;
  title: string;
  detail: string;
  href: string;
  user_label?: string | null;
};

export type CrewDaySchedule = {
  user: ScheduleUser;
  entries: CalendarEntry[];
};

export type ScheduleDashboardSummary = {
  conflicts: ScheduleConflict[];
  todaysCrewSchedules: CrewDaySchedule[];
  unassignedEntries: CalendarEntry[];
  upcomingEstimates: CalendarEntry[];
};

export type DocumentTemplate = {
  id: string;
  name: string;
  purpose: "quote_email" | "invoice_email" | "follow_up_email" | "review_request" | "work_order";
  subject: string;
  body: string;
};

export type QuoteDocumentPreview = {
  customerLabel: string;
  jobLocationLabel: string;
  scopeOfWork: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }[];
  totalCents: number;
  notes: string;
  approvalLabel: string;
};

export type InvoiceDocumentPreview = {
  customerLabel: string;
  invoiceNumberLabel: string;
  jobLocationLabel: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }[];
  totalDueCents: number;
  paymentStatusLabel: string;
  dueDateLabel: string;
};

export type CustomerDetail = {
  customer: Customer;
  serviceLocations: ServiceLocation[];
  notes: Note[];
  jobs: JobWithRelations[];
  quotes: QuoteWithRelations[];
  invoices: InvoiceWithRelations[];
};

export type JobDetail = JobWithRelations & {
  notes?: Note[];
  job_photos?: JobPhoto[];
  quotes?: QuoteWithRelations[];
  invoices?: InvoiceWithRelations[];
  change_orders?: ChangeOrderWithRelations[];
  appointments?: AppointmentWithRelations[];
  equipment_assignments?: (EquipmentAssignment & {
    equipment_assets?: Pick<EquipmentAsset, "id" | "asset_number" | "name" | "status" | "category"> | null;
  })[];
};

export type QuoteDetail = QuoteWithRelations & {
  jobs?: JobWithRelations | null;
  invoices?: InvoiceWithRelations[];
  notes?: Note[];
};

export type InvoiceDetail = InvoiceWithRelations & {
  jobs?: JobWithRelations | null;
  notes?: Note[];
};

export type OrganizationDetail = {
  organization: Organization;
  contacts: OrganizationContact[];
  customers: Customer[];
  serviceLocations: ServiceLocation[];
  jobs: JobWithRelations[];
  quotes: QuoteWithRelations[];
  invoices: InvoiceWithRelations[];
  changeOrders: ChangeOrderWithRelations[];
  payments: Payment[];
  activity: {
    id: string;
    subject_type: string;
    subject_id: string;
    event_type: string;
    metadata_json: Record<string, unknown>;
    created_at: string;
  }[];
  outstandingBalanceCents: number;
};

export type DataResult<T> = {
  data: T;
  error: string | null;
};

export type EquipmentAsset = {
  id: string;
  asset_number: string;
  name: string;
  category: EquipmentCategory;
  manufacturer: string | null;
  model: string | null;
  model_year: number | null;
  serial_number: string | null;
  vin: string | null;
  license_plate: string | null;
  ownership_type: "owned" | "leased" | "rented" | "other" | null;
  purchase_date: string | null;
  status: EquipmentStatus;
  current_mileage: number | null;
  current_hours: number | null;
  location_label: string | null;
  assigned_employee_id: string | null;
  photo_storage_path: string | null;
  safety_class: string | null;
  ppe_required: string | null;
  inspection_template_key: string | null;
  inspection_interval_days: number | null;
  next_inspection_due_at: string | null;
  admin_notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EquipmentAssignment = {
  id: string;
  asset_id: string;
  job_id: string | null;
  schedule_event_id: string | null;
  assigned_user_id: string | null;
  starts_at: string;
  ends_at: string | null;
  notes: string | null;
  conflict_override_reason: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<AssignableUser, "id" | "full_name" | "email"> | null;
  jobs?: Pick<Job, "id" | "service_type" | "status"> | null;
  schedule_events?: Pick<ScheduleEvent, "id" | "title" | "starts_at" | "ends_at"> | null;
};

export type EquipmentMaintenanceSchedule = {
  id: string;
  asset_id: string;
  title: string;
  maintenance_type: "preventive" | "inspection" | "repair" | "registration" | "other";
  interval_days: number | null;
  interval_miles: number | null;
  interval_hours: number | null;
  last_completed_at: string | null;
  next_due_at: string | null;
  next_due_mileage: number | null;
  next_due_hours: number | null;
  instructions: string | null;
  is_active: boolean;
};

export type EquipmentMaintenanceRecord = {
  id: string;
  asset_id: string;
  schedule_id: string | null;
  schedule_event_id: string | null;
  maintenance_type: "preventive" | "inspection" | "repair" | "registration" | "other";
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  title: string;
  description: string | null;
  vendor_name: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  mileage_at_service: number | null;
  hours_at_service: number | null;
  cost_cents: number | null;
  created_at: string;
  updated_at: string;
};

export type EquipmentInspection = {
  id: string;
  asset_id: string;
  assignment_id: string | null;
  job_id: string | null;
  template_key: string;
  template_version: number;
  responses_json: Record<string, "pass" | "attention" | "fail">;
  overall_result: EquipmentInspectionResult;
  notes: string | null;
  mileage: number | null;
  hours: number | null;
  inspected_by_user_id: string | null;
  inspected_at: string;
  profiles?: Pick<AssignableUser, "id" | "full_name" | "email"> | null;
};

export type EquipmentProblemReport = {
  id: string;
  asset_id: string;
  assignment_id: string | null;
  job_id: string | null;
  severity: "attention" | "unsafe" | "critical";
  status: "open" | "triaged" | "repair_scheduled" | "resolved" | "dismissed";
  title: string;
  description: string;
  equipment_stopped: boolean;
  photo_storage_path: string | null;
  photo_signed_url?: string | null;
  reported_by_user_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<AssignableUser, "id" | "full_name" | "email"> | null;
};

export type EquipmentReading = {
  id: string;
  asset_id: string;
  reading_type: "mileage" | "hours";
  reading_value: number;
  recorded_at: string;
  correction_reason: string | null;
  supersedes_reading_id: string | null;
  source: "manual" | "inspection" | "maintenance" | "closeout";
};

export type EquipmentDocument = {
  id: string;
  asset_id: string;
  document_type: "registration" | "insurance" | "inspection" | "manual" | "warranty" | "receipt" | "photo" | "other";
  title: string;
  storage_path: string;
  signed_url?: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EquipmentDetail = EquipmentAsset & {
  equipment_assignments?: EquipmentAssignment[];
  equipment_maintenance_schedules?: EquipmentMaintenanceSchedule[];
  equipment_maintenance_records?: EquipmentMaintenanceRecord[];
  equipment_inspections?: EquipmentInspection[];
  equipment_problem_reports?: EquipmentProblemReport[];
  equipment_readings?: EquipmentReading[];
  equipment_documents?: EquipmentDocument[];
};

export type CrewEquipmentAssignment = {
  assignment_id: string;
  asset_id: string;
  asset_number: string;
  asset_name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  manufacturer: string | null;
  model: string | null;
  photo_storage_path: string | null;
  safety_class: string | null;
  ppe_required: string | null;
  inspection_template_key: string | null;
  next_inspection_due_at: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  starts_at: string;
  ends_at: string | null;
  assignment_notes: string | null;
};

export type EmploymentStatus = "applicant" | "onboarding" | "active" | "seasonal" | "leave" | "inactive" | "separated";
export type EmployeeRecord = {
  id: string;
  auth_user_id: string | null;
  access_request_id: string | null;
  legal_name: string | null;
  preferred_name: string | null;
  employee_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  home_address: string | null;
  hire_date: string | null;
  employment_status: EmploymentStatus;
  employment_type: "permanent" | "seasonal" | "temporary" | "contractor" | "other" | null;
  job_title: string | null;
  department: string | null;
  crew_name: string | null;
  supervisor_employee_id: string | null;
  preferred_language: string | null;
  operational_notes: string | null;
  profile_photo_storage_path: string | null;
  is_supervisor: boolean;
  is_active: boolean;
  separation_date: string | null;
  separation_reason: string | null;
  manual_review_required: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: AssignableUser | null;
  supervisor?: Pick<EmployeeRecord, "id" | "preferred_name" | "legal_name"> | null;
};
export type ServiceCategory = {
  id: string;
  category_key: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
export type ReportingSettings = {
  singleton_key: boolean;
  business_timezone: string;
  draft_quote_stale_days: number;
  sent_quote_stale_days: number;
  lead_stale_business_days: number;
  default_labor_burden_percent: number | null;
  blended_labor_cost_cents: number | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};
export type EmployeeLaborCostRate = {
  id: string;
  employee_id: string;
  hourly_cost_cents: number;
  burden_percent: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};
export type JobCostCategory = "materials" | "disposal" | "subcontractor" | "equipment_rental" | "crane" | "fuel" | "permit" | "travel" | "other";
export type JobCostEntry = {
  id: string;
  job_id: string;
  category: JobCostCategory;
  description: string;
  vendor_name: string | null;
  amount_cents: number;
  incurred_on: string;
  notes: string | null;
  receipt_storage_path: string | null;
  review_status: "pending" | "approved" | "rejected";
  submitted_by_user_id: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  supersedes_cost_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type EmployeeEmergencyContact = { id: string; employee_id: string; full_name: string; relationship: string | null; phone: string; alternate_phone: string | null; is_primary: boolean; created_at: string; updated_at: string };
export type EmployeeOnboardingItem = { id: string; employee_id: string; item_key: string; label: string; sort_order: number; completion_status: "incomplete" | "complete" | "not_applicable"; notes: string | null; completed_at: string | null; completed_by_user_id: string | null; reopened_at: string | null; reopen_reason: string | null; updated_at: string };
export type CredentialType = { id: string; type_key: string; label: string; default_warning_days: number; description: string | null; is_active: boolean };
export type EmployeeCredential = { id: string; employee_id: string; credential_type_id: string; credential_number: string | null; issuing_organization: string | null; issue_date: string | null; expiration_date: string | null; status: "pending_verification" | "active" | "suspended" | "revoked" | "not_required"; verified_at: string | null; verified_by_user_id: string | null; document_id: string | null; notes: string | null; archived_at: string | null; created_at: string; updated_at: string; credential_types?: CredentialType | null };
export type EmployeeDocument = { id: string; employee_id: string; document_type: string; title: string; storage_path: string; mime_type: string | null; file_size_bytes: number | null; issue_date: string | null; expiration_date: string | null; access_classification: "employee_visible" | "supervisor_visible" | "admin_only" | "owner_only"; review_status: "pending" | "approved" | "rejected"; review_notes: string | null; notes: string | null; archived_at: string | null; created_at: string; updated_at: string; signed_url?: string | null };
export type TrainingSession = { id: string; title: string; training_type: string; provider_or_instructor: string | null; starts_at: string; duration_minutes: number | null; location_label: string | null; refresher_due_at: string | null; instructor_notes: string | null; document_version: string | null; archived_at: string | null; created_at: string; updated_at: string };
export type TrainingAttendee = { id: string; training_session_id: string; employee_id: string; result: "completed" | "passed" | "failed" | "incomplete"; score: number | null; attendee_notes: string | null; acknowledged_at: string | null; acknowledgment_name: string | null; training_sessions?: TrainingSession | null };
export type SafetyMeeting = { id: string; title: string; topic_key: string | null; starts_at: string; location_label: string | null; leader_name: string | null; subject_matter: string | null; meeting_notes: string | null; follow_up_actions: string | null; document_version: string | null; archived_at: string | null; created_at: string; updated_at: string };
export type SafetyMeetingAttendee = { id: string; safety_meeting_id: string; employee_id: string; attendance_status: "present" | "absent" | "excused"; acknowledged_at: string | null; acknowledgment_name: string | null; notes: string | null; safety_meetings?: SafetyMeeting | null };
export type EmployeeRequest = { id: string; employee_id: string; request_type: "profile_correction" | "credential_renewal" | "training_request" | "document_review" | "other"; title: string; details: string; status: "pending" | "approved" | "rejected" | "completed"; review_notes: string | null; created_at: string; updated_at: string };
export type EmployeeDetail = EmployeeRecord & {
  employee_emergency_contacts?: EmployeeEmergencyContact[];
  employee_onboarding_items?: EmployeeOnboardingItem[];
  employee_credentials?: EmployeeCredential[];
  employee_documents?: EmployeeDocument[];
  employee_requests?: EmployeeRequest[];
  training_attendees?: TrainingAttendee[];
  safety_meeting_attendees?: SafetyMeetingAttendee[];
  employee_separation_items?: EmployeeOnboardingItem[];
};
export type EmployeeSelfServiceData = {
  employee: Pick<EmployeeRecord, "id" | "legal_name" | "preferred_name" | "employee_number" | "contact_email" | "contact_phone" | "home_address" | "hire_date" | "employment_status" | "job_title" | "department" | "crew_name" | "preferred_language" | "is_supervisor">;
  onboarding: { id: string; label: string; status: string; notes: string | null }[];
  credentials: { id: string; type: string; issue_date: string | null; expiration_date: string | null; status: string; verified_at: string | null }[];
  training: { id: string; title: string; starts_at: string; result: string; refresher_due_at: string | null; document_version: string | null; acknowledged_at: string | null }[];
  safety_meetings: { id: string; title: string; starts_at: string; attendance_status: string; acknowledged_at: string | null; document_version: string | null }[];
  documents: { id: string; title: string; document_type: string; expiration_date: string | null; review_status: string; storage_path: string; signed_url?: string | null }[];
  requests: { id: string; request_type: string; title: string; status: string; review_notes: string | null; created_at: string }[];
  issued_equipment: { assignment_id: string; asset_id: string; asset_number: string; name: string; category: string; condition: string | null; assigned_at: string; expected_return_at: string | null; returned_at: string | null }[];
};
export type SupervisedTeamData = { is_supervisor: boolean; employees: { id: string; preferred_name: string | null; legal_name: string | null; job_title: string | null; crew_name: string | null; employment_status: EmploymentStatus; onboarding_progress: number; credentials: { label: string; status: string; expiration_date: string | null }[]; training_count: number; pending_safety_acknowledgments: number; documents: { id: string; title: string; access_classification: string; signed_url: string | null }[] }[] };
