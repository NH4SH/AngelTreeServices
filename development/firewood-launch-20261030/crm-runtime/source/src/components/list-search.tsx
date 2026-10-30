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
  const valueRef = useRef(initialValue);
  const pendingNavigationRef = useRef<string | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const normalizedInitial = initialValue.trim();
    const normalizedCurrent = valueRef.current.trim();

    if (pendingNavigationRef.current !== null) {
      if (normalizedInitial === pendingNavigationRef.current) {
        pendingNavigationRef.current = null;
      }

      // A server render for an older search must never overwrite newer typing.
      if (normalizedInitial !== normalizedCurrent) return;
    }

    if (initialValue !== valueRef.current) {
      valueRef.current = initialValue;
      setValue(initialValue);
    }
  }, [initialValue]);

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
    pendingNavigationRef.current = normalized;
    if (normalized) params.set("q", normalized);
    else params.delete("q");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function updateValue(nextValue: string) {
    valueRef.current = nextValue;
    setValue(nextValue);
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
          onChange={(event) => updateValue(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
      </label>
      {value ? (
        <button aria-label={`Clear ${label.toLowerCase()}`} onClick={() => updateValue("")} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      ) : null}
    </form>
  );
}
