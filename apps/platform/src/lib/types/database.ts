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
export type OrganizationType = "property_manager" | "hoa" | "commercial" | "other";
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

export type Organization = {
  id: string;
  name: string;
  organization_type: OrganizationType;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  notes: string | null;
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
  customer_id: string;
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
  customer_id: string;
  service_location_id: string;
  source_quote_id: string | null;
  lead_source_id: string | null;
  assigned_crew_user_id: string | null;
  status: JobStatus;
  service_type: JobServiceType | string | null;
  priority: JobPriority;
  requested_scope: string | null;
  internal_notes: string | null;
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
  customer_id: string;
  service_location_id: string | null;
  estimate_schedule_event_id: string | null;
  status: QuoteStatus;
  quote_number: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_message: string | null;
  sent_at: string | null;
  sent_method: QuoteSentMethod | null;
  sent_by_user_id: string | null;
  automatic_follow_ups_enabled: boolean;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
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
  customer_id: string;
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
  customer_id: string;
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
  customer_id: string;
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
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  invoice_id: string;
  customer_id: string;
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
  customer_id: string;
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
  job_id: string;
  status: JobCloseoutStatus;
  crew_internal_notes: string | null;
  customer_summary: string | null;
  incident_occurred: boolean | null;
  incident_description: string | null;
  additional_work_requested: boolean | null;
  additional_work_description: string | null;
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
  invoice_line_items?: InvoiceLineItem[];
  payments?: Payment[];
};

export type ScheduleLinkedJobSummary = Pick<Job, "id" | "customer_id" | "status" | "service_type" | "requested_scope"> & {
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
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
  appointments?: AppointmentWithRelations[];
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
};

export type DataResult<T> = {
  data: T;
  error: string | null;
};
