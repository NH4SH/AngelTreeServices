export type CsvCell = string | number | boolean | null | undefined;

export function serializeCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(serializeCsvCell).join(",")).join("\r\n");
}

export function serializeCsvCell(value: CsvCell) {
  const typedNumber = typeof value === "number";
  let text = String(value ?? "");

  // Numeric cells retain spreadsheet semantics. Text cells are neutralized
  // before RFC 4180 escaping so spreadsheet software cannot execute formulas.
  if (!typedNumber && /^[=+\-@\t\r\n]/.test(text)) {
    text = `'${text}`;
  }

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
