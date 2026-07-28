const defaultInvoiceTermDays = 15;
const businessTimeZone = "America/New_York";

export function getDefaultInvoiceDueDate(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: businessTimeZone,
    year: "numeric",
  }).formatToParts(reference);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const businessDate = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  ));

  businessDate.setUTCDate(businessDate.getUTCDate() + defaultInvoiceTermDays);
  return businessDate.toISOString().slice(0, 10);
}

export function getInvoiceDueAt(dateInput?: string | null, reference = new Date()) {
  const requestedDate = dateInput?.trim() ?? "";
  const dueDate = isDateInput(requestedDate) ? requestedDate : getDefaultInvoiceDueDate(reference);
  return new Date(`${dueDate}T17:00:00.000Z`).toISOString();
}

function isDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
