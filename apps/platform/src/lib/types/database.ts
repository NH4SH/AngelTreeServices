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

export type AppointmentType = "estimate" | "job" | "follow_up" | "maintenance" | "other";
export type AppointmentStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void" | "overdue";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "cancelled";
export type JobPhotoType = "before" | "after" | "customer_upload" | "estimate" | "job" | "issue";
export type JobPhotoUploadCategory = "before" | "after" | "issue" | "completion";

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
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: string;
  job_id: string;
  customer_id: string;
  status: QuoteStatus;
  quote_number: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_message: string | null;
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
  payment_method: string | null;
  provider: string | null;
  provider_payment_id: string | null;
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

export type CustomerWithLocations = Customer & {
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code">[];
};

export type JobWithRelations = Job & {
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code"> | null;
};

export type CrewJob = Job & {
  customers?: Pick<Customer, "id" | "display_name" | "phone"> | null;
  service_locations?: Pick<
    ServiceLocation,
    | "id"
    | "label"
    | "street"
    | "city"
    | "state"
    | "postal_code"
    | "access_notes"
    | "gate_code"
    | "service_notes"
  > | null;
  job_photos?: Pick<JobPhoto, "id" | "photo_type" | "storage_path" | "caption" | "created_at">[];
  notes?: Pick<Note, "id" | "visibility" | "body" | "created_at">[];
};

export type QuoteWithRelations = Quote & {
  jobs?: Pick<Job, "id" | "status" | "service_type"> | null;
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  quote_line_items?: QuoteLineItem[];
};

export type InvoiceWithRelations = Invoice & {
  jobs?: Pick<Job, "id" | "status" | "service_type" | "requested_scope"> | null;
  customers?: Pick<Customer, "id" | "display_name" | "phone" | "email"> | null;
  invoice_line_items?: InvoiceLineItem[];
  payments?: Payment[];
};

export type AppointmentWithRelations = Appointment & {
  jobs?: Pick<Job, "id" | "status" | "service_type" | "requested_scope"> | null;
  service_locations?: Pick<ServiceLocation, "id" | "label" | "street" | "city" | "state" | "postal_code"> | null;
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

export type DataResult<T> = {
  data: T;
  error: string | null;
};
