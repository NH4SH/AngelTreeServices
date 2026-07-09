import type { InvoiceStatus } from "@/lib/types/database";

export function formatInvoiceStatus(status: InvoiceStatus, audience: "admin" | "customer" = "admin") {
  if (status === "draft") {
    return audience === "customer" ? "Unpaid" : "Ready to send";
  }

  if (status === "partially_paid") {
    return "Partially paid";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function getInvoiceDisplayNumber(invoiceNumber: string | null) {
  return invoiceNumber || "Invoice";
}
