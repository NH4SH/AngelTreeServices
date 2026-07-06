"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print preview" }: { label?: string }) {
  return (
    <button className="secondary-action button-reset print-hidden" onClick={() => window.print()} type="button">
      <Printer aria-hidden="true" size={18} />
      {label}
    </button>
  );
}
