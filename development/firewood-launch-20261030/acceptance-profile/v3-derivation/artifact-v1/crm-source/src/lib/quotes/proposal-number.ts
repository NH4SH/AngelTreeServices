const datedQuoteNumberPattern = /^Q-(\d{4})(\d{2})(\d{2})-(\d+)$/i;
const legacyQuoteNumberPattern = /^Q-(\d+)$/i;

export function formatProposalNumber(quoteNumber?: string | null) {
  const value = quoteNumber?.trim();
  if (!value) return null;

  const datedMatch = value.match(datedQuoteNumberPattern);
  if (datedMatch) {
    const sequence = Number.parseInt(datedMatch[4], 10);
    const formattedSequence = Number.isFinite(sequence)
      ? String(sequence).padStart(2, "0")
      : datedMatch[4];
    return `${datedMatch[1].slice(-2)}${datedMatch[2]}${datedMatch[3]}-${formattedSequence}`;
  }

  return value.match(legacyQuoteNumberPattern)?.[1] ?? null;
}

export function formatProposalReference(quoteNumber?: string | null) {
  const formatted = formatProposalNumber(quoteNumber);
  return formatted ? `Proposal #${formatted}` : "Prepared proposal";
}
