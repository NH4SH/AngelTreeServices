export type PortalWorkSummary =
  | {
      mode: "short";
      items: string[];
    }
  | {
      areaCount: number;
      itemCount: number;
      message: string;
      mode: "long";
    };

type PortalQuoteScope = {
  jobs?: {
    requested_scope?: string | null;
  } | null;
  quote_line_items?: {
    description?: string | null;
    name: string;
  }[];
};

const conciseScopeCharacterLimit = 250;
const conciseScopeItemLimit = 3;
const conciseItemCharacterLimit = 110;

const locationHeadings = new Set([
  "back of property",
  "back of the property",
  "back property",
  "beside left",
  "beside right",
  "close to shed",
  "close to the shed",
  "front of house",
  "front of the house",
  "left side",
  "left side of house",
  "left side of the house",
  "near shed",
  "near the shed",
  "right side",
  "right side of house",
  "right side of the house",
]);

export function buildPortalWorkSummary(quote: PortalQuoteScope): PortalWorkSummary | null {
  const lineItems = quote.quote_line_items ?? [];
  const fallbackScope = quote.jobs?.requested_scope?.trim() ?? "";
  const descriptions = lineItems.map((item) => item.description?.trim() ?? "").filter(Boolean);
  const fullScope = [
    ...lineItems.flatMap((item) => [item.name.trim(), item.description?.trim() ?? ""]),
    lineItems.length ? "" : fallbackScope,
  ].filter(Boolean).join("\n");

  if (!fullScope) return null;

  const scopeLines = [...descriptions, lineItems.length ? "" : fallbackScope]
    .flatMap((value) => value.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  const areaCount = scopeLines.filter(isLocationHeading).length;
  const bulletItems = scopeLines
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
  const summaryItems = bulletItems.length
    ? bulletItems
    : lineItems.length
      ? lineItems.map((item) => item.name.trim()).filter(Boolean)
      : fallbackItems(fallbackScope);
  const contentItems = scopeLines
    .filter((line) => !isLocationHeading(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
  const itemCount = Math.max(1, summaryItems.length || lineItems.length);
  const isConcise =
    itemCount <= conciseScopeItemLimit
    && fullScope.length <= conciseScopeCharacterLimit
    && areaCount <= 1
    && summaryItems.every((item) => item.length <= conciseItemCharacterLimit)
    && contentItems.every((item) => item.length <= conciseItemCharacterLimit);

  if (isConcise && summaryItems.length) {
    return {
      items: summaryItems.slice(0, conciseScopeItemLimit),
      mode: "short",
    };
  }

  const areaPhrase = areaCount > 1 ? ` across ${areaCount} areas of the property` : "";
  return {
    areaCount,
    itemCount,
    message: `This proposal includes ${itemCount} ${itemCount === 1 ? "scope item" : "scope items"}${areaPhrase}.`,
    mode: "long",
  };
}

export function formatCustomerQuoteStatus(status: string) {
  switch (status) {
    case "approved":
      return "Approved";
    case "change_requested":
      return "Changes requested";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    case "cancelled":
      return "No longer active";
    case "sent":
      return "Awaiting your response";
    default:
      return "Ready for review";
  }
}

function fallbackItems(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isLocationHeading(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function isLocationHeading(value: string) {
  return locationHeadings.has(
    value
      .trim()
      .replace(/[.:]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase(),
  );
}
