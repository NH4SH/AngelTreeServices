const canonicalLegacyAddress = [
  "Angel Tree Services LLC",
  "5802 Ford Rd",
  "Fredericksburg, VA 22407",
].join("\n");

const knownLegacyCommaAddress = "Angel Tree Services LLC, 5802 Ford Rd, Fredericksburg, VA 22407";

export function normalizeBusinessCheckMailingAddress(value: string | undefined) {
  const normalizedNewlines = value?.trim().replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
  if (!normalizedNewlines) return null;

  // Support the one known legacy Netlify value without treating arbitrary
  // commas in company names or addresses as line separators.
  if (normalizedNewlines.replace(/\s+/g, " ") === knownLegacyCommaAddress) {
    return canonicalLegacyAddress;
  }

  return normalizedNewlines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
