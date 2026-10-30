export const notificationCategories = [
  "quotes",
  "change_orders",
  "messages",
  "files",
  "customer_updates",
  "payments",
  "other",
] as const;

export type NotificationCategory = (typeof notificationCategories)[number];

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  quotes: "Quotes",
  change_orders: "Change orders",
  messages: "Customer messages",
  files: "Files and photos",
  customer_updates: "Customer updates",
  payments: "Payments",
  other: "Other activity",
};

export const emailPreferenceFields = {
  quotes: "quote_email_enabled",
  change_orders: "change_order_email_enabled",
  messages: "message_email_enabled",
  files: "file_email_enabled",
  customer_updates: "customer_update_email_enabled",
  payments: "payment_email_enabled",
} as const;

export type EmailPreferenceCategory = keyof typeof emailPreferenceFields;
