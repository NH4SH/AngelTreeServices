export const healthStatuses = ["operational", "degraded", "outage", "unknown", "not_configured"] as const;
export type HealthStatus = (typeof healthStatuses)[number];

export const healthCategories = ["website", "customer_portal", "crm", "data", "communications", "payments"] as const;
export type HealthCategory = (typeof healthCategories)[number];

export type HealthComponentDefinition = {
  category: HealthCategory;
  critical: boolean;
  description: string;
  key: string;
  label: string;
};

export const healthComponents: HealthComponentDefinition[] = [
  { key: "public_homepage", label: "Public website", category: "website", critical: true, description: "Homepage response and expected Angel Tree content." },
  { key: "public_assets", label: "Website assets", category: "website", critical: true, description: "Essential favicon delivery." },
  { key: "contact_form_canary", label: "Contact form", category: "website", critical: true, description: "Authenticated end-to-end validation through the real lead-intake route without creating a lead." },
  { key: "crm_application", label: "CRM application", category: "crm", critical: true, description: "Sanitized platform liveness endpoint." },
  { key: "scheduled_workflow_worker", label: "Scheduled workflow worker", category: "crm", critical: false, description: "Read-only check for overdue jobs that should already have advanced into progress." },
  { key: "customer_portals", label: "Quote and invoice portals", category: "customer_portal", critical: true, description: "Customer portal routes load without exposing a real token." },
  { key: "supabase_database", label: "Database", category: "data", critical: true, description: "Read-only Supabase database connectivity." },
  { key: "supabase_auth", label: "Authentication", category: "data", critical: true, description: "Supabase Auth service availability." },
  { key: "supabase_storage", label: "Private file storage", category: "data", critical: false, description: "Read-only bucket metadata access." },
  { key: "resend_email", label: "Transactional email", category: "communications", critical: true, description: "Resend API connectivity without sending an email." },
  { key: "communication_queue", label: "Communication queue", category: "communications", critical: true, description: "Queued reminders, recent failures, and delivery activity." },
  { key: "stripe_api", label: "Stripe API", category: "payments", critical: true, description: "Non-destructive Stripe account connectivity." },
  { key: "stripe_webhooks", label: "Stripe webhooks", category: "payments", critical: true, description: "Webhook configuration and the latest idempotent receipt." },
];

export const healthComponentByKey = new Map(healthComponents.map((component) => [component.key, component]));

export const healthCategoryLabels: Record<HealthCategory, string> = {
  website: "Website",
  customer_portal: "Customer Portal",
  crm: "CRM",
  data: "Data",
  communications: "Communications",
  payments: "Payments",
};
