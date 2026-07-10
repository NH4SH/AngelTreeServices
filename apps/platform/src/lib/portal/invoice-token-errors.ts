const invoicePortalTokenMigrationNames = [
  "20260709132222_invoice_portal_tokens.sql",
  "20260710150434_ensure_invoice_portal_tokens.sql",
];

export function formatInvoicePortalTokenError(message: string | null | undefined) {
  if (!message) {
    return "Could not manage the secure invoice link.";
  }

  if (isInvoicePortalTokenTableMissing(message)) {
    return `Customer invoice links are not configured yet. Apply the pending Supabase invoice-token migrations (${invoicePortalTokenMigrationNames.join(", ")}), then refresh the Supabase schema cache.`;
  }

  return message;
}

export function isInvoicePortalTokenTableMissing(message: string | null | undefined) {
  const normalized = String(message ?? "").toLowerCase();

  return (
    normalized.includes("invoice_portal_tokens") &&
    (normalized.includes("schema cache") ||
      normalized.includes("could not find the table") ||
      normalized.includes("does not exist"))
  );
}
