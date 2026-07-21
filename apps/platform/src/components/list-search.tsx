"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ListSearch({
  initialValue = "",
  label,
  placeholder,
}: {
  initialValue?: string;
  label: string;
  placeholder: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const firstRender = useRef(true);

  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => navigate(value), 350);
    return () => window.clearTimeout(timer);
  }, [value]);

  function navigate(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    const normalized = nextValue.trim();
    if (normalized) params.set("q", normalized);
    else params.delete("q");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form
      className="list-search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(value);
      }}
      role="search"
    >
      <label>
        <span className="sr-only">{label}</span>
        <Search aria-hidden="true" size={19} />
        <input
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
      </label>
      {value ? (
        <button aria-label={`Clear ${label.toLowerCase()}`} onClick={() => setValue("")} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      ) : null}
    </form>
  );
}
