"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

const quoteListEmailFormId = "quote-list-combined-email";

export function QuoteListEmailToolbar() {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    function updateSelectedCount() {
      setSelectedCount(document.querySelectorAll(`input[form="${quoteListEmailFormId}"][name="quote_id"]:checked`).length);
    }

    document.addEventListener("change", updateSelectedCount);
    return () => document.removeEventListener("change", updateSelectedCount);
  }, []);

  return (
    <form action="/admin/quotes/email" className="quote-list-email-toolbar" id={quoteListEmailFormId} method="get">
      <div>
        <Mail aria-hidden="true" size={19} />
        <span>
          <strong>Email multiple quotes</strong>
          <small>{selectedCount ? `${selectedCount} selected` : "Select two quotes for the same customer"}</small>
        </span>
      </div>
      <button className="secondary-action" disabled={selectedCount < 2} type="submit">
        Email selected quotes
      </button>
    </form>
  );
}
