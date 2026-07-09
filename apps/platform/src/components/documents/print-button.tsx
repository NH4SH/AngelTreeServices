"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

export function PrintButton({ href, label = "Print preview" }: { href?: string; label?: string }) {
  if (href) {
    return (
      <Link className="secondary-action button-reset print-hidden" href={href} target="_blank">
        <Printer aria-hidden="true" size={18} />
        {label}
      </Link>
    );
  }

  return (
    <button className="secondary-action button-reset print-hidden" onClick={() => window.print()} type="button">
      <Printer aria-hidden="true" size={18} />
      {label}
    </button>
  );
}
