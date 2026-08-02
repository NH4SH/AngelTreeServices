"use client";

import Link from "next/link";
import { Mail, SquareArrowOutUpRight } from "lucide-react";
import { useMemo, useState } from "react";

export type SelectableCustomerQuote = {
  id: string;
  label: string;
  locationLabel: string;
  statusLabel: string;
  totalLabel: string;
  eligible: boolean;
  ineligibleReason?: string;
};

export function MultiQuoteEmailSelection({ quotes }: { quotes: SelectableCustomerQuote[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedCount = selectedIds.size;
  const eligibleCount = useMemo(() => quotes.filter((quote) => quote.eligible).length, [quotes]);

  function toggleQuote(quoteId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(quoteId)) next.delete(quoteId);
      else next.add(quoteId);
      return next;
    });
  }

  return (
    <form action="/admin/quotes/email" className="multi-quote-selection" method="get">
      <div className="multi-quote-selection-toolbar">
        <div>
          <strong>Email proposals together</strong>
          <span>{selectedCount ? `${selectedCount} selected` : "Select two or more open quotes"}</span>
        </div>
        <button className="secondary-action" disabled={selectedCount < 2} type="submit">
          <Mail aria-hidden="true" size={17} />
          Email selected quotes
        </button>
      </div>
      {eligibleCount < 2 ? <p className="form-helper">At least two open, sendable quotes are needed for a combined email.</p> : null}
      <div className="multi-quote-selection-list">
        {quotes.map((quote) => (
          <div className={`multi-quote-selection-row${quote.eligible ? "" : " is-disabled"}`} key={quote.id}>
            <label>
              <input
                checked={selectedIds.has(quote.id)}
                disabled={!quote.eligible}
                name="quote_id"
                onChange={() => toggleQuote(quote.id)}
                type="checkbox"
                value={quote.id}
              />
              <span>
                <strong>{quote.label}</strong>
                <small>{quote.locationLabel}</small>
                <small>{quote.statusLabel} · {quote.totalLabel}</small>
                {!quote.eligible && quote.ineligibleReason ? <em>{quote.ineligibleReason}</em> : null}
              </span>
            </label>
            <Link aria-label={`Open ${quote.label}`} href={`/admin/quotes/${quote.id}`}>
              <SquareArrowOutUpRight aria-hidden="true" size={17} />
            </Link>
          </div>
        ))}
      </div>
    </form>
  );
}
