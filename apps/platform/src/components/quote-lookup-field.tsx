"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { draftPrivacyGeneration, draftSession } from "@/lib/drafts/browser-privacy";
import { lookupParty, lookupUuid, quoteLookupKey, validLookupPage, type QuoteLookupKind, type QuoteLookupOption, type QuoteLookupPage } from "@/lib/quotes/lookup-contract";
import "./quote-lookup-field.css";

type Props = { userId: string; kind: QuoteLookupKind; name: string; label: string; placeholder: string; value: string; scope: string; seedScope: string; seed?: QuoteLookupOption; required?: boolean; disabled?: boolean; endpoint?: string; allowNewCustomer?: boolean; customerOnly?: boolean; organizationOnly?: boolean; onSelection?: (option: QuoteLookupOption | undefined) => void; validateOption?: (option: QuoteLookupOption) => boolean; onChange: (value: string) => void; onReady: (ready: boolean, key: string) => void };
const validOption = (kind: QuoteLookupKind, option: QuoteLookupOption) => kind === "party" ? Boolean(lookupParty(option.value)) : lookupUuid(option.value);
async function fetchPage(endpoint: string, params: URLSearchParams, signal: AbortSignal): Promise<QuoteLookupPage> {
  const response = await fetch(`${endpoint}?${params}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw Error("Lookup unavailable");
  const data: unknown = await response.json();
  if (!validLookupPage(data)) throw Error("Invalid lookup reply");
  return data;
}

/** Native select semantics and stable form values; browsing never edits the quote. */
export function QuoteLookupField({ userId, kind, name, label, placeholder, value, scope, seedScope, seed, required, disabled, endpoint = "/api/admin/quotes/lookups", allowNewCustomer = false, customerOnly = false, organizationOnly = false, onSelection, validateOption, onChange, onReady }: Props) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const id = useId(), statusId = `${id}-status`, searchId = `${id}-search`, [open, setOpen] = useState(false), [query, setQuery] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [partyType, setPartyType] = useState<"customer" | "organization">(() => organizationOnly ? "organization" : lookupParty(value)?.kind ?? "customer");
  const cache = useRef(new Map<string, QuoteLookupOption>()), readyRef = useRef(onReady); readyRef.current = onReady;
  const selectedRef = useRef(onSelection), validateRef = useRef(validateOption); selectedRef.current = onSelection; validateRef.current = validateOption;
  const seedUser = useRef(userId);
  const key = quoteLookupKey(userId, kind, scope, value), browseKey = JSON.stringify([userId, kind, scope, partyType, query, page]);
  const initial = seedUser.current === userId && seed?.value === value && seedScope === scope && (!validateOption || validateOption(seed)) ? seed : undefined;
  const [selection, setSelection] = useState<{ key: string; option?: QuoteLookupOption; status: "ready" | "loading" | "error" }>({ key, option: initial, status: !value || initial ? "ready" : "loading" });
  const [results, setResults] = useState<{ key: string; data?: QuoteLookupPage; error?: boolean; loading: boolean }>({ key: "", loading: false });
  useEffect(() => { setPage(1); setQuery(""); setOpen(false); }, [scope]);
  useEffect(() => { if (!open && kind === "party") setPartyType(organizationOnly ? "organization" : lookupParty(value)?.kind ?? "customer"); }, [value, kind, open, organizationOnly]);

  useEffect(() => {
    const controller = new AbortController(), epoch = draftPrivacyGeneration();
    if (allowNewCustomer && value === "new_customer") { setSelection({ key, status: "ready" }); readyRef.current(true, key); return () => controller.abort(); }
    const cached = cache.current.get(key) ?? (seedUser.current === userId && seed?.value === value && seedScope === scope ? seed : undefined);
    const option = cached && (!validateRef.current || validateRef.current(cached)) ? cached : undefined;
    if (!value || option) { selectedRef.current?.(option); if (option) cache.current.set(key, option); setSelection({ key, option, status: "ready" }); readyRef.current(true, key); return () => controller.abort(); }
    selectedRef.current?.(undefined); setSelection({ key, status: "loading" }); readyRef.current(false, key);
    if (disabled) return () => controller.abort();
    const params = new URLSearchParams({ kind, selected: value, ...(scope ? { party: scope } : {}) });
    void fetchPage(endpoint, params, controller.signal).then(data => {
      if (controller.signal.aborted || epoch !== draftPrivacyGeneration() || !draftSession(userId)) return;
      const found = data.items.find(item => item.value === value && validOption(kind, item) && (!validateRef.current || validateRef.current(item)) && !(customerOnly && kind === "party" && lookupParty(item.value)?.kind !== "customer") && !(organizationOnly && kind === "party" && lookupParty(item.value)?.kind !== "organization"));
      if (!found) throw Error("Selection unavailable");
      selectedRef.current?.(found); cache.current.set(key, found); setSelection({ key, option: found, status: "ready" }); readyRef.current(true, key);
    }).catch(() => { if (!controller.signal.aborted) { setSelection({ key, status: "error" }); readyRef.current(false, key); } });
    return () => controller.abort();
  }, [key, value, kind, scope, userId, disabled, seed?.value, seed?.label, seedScope, retry, endpoint, allowNewCustomer, customerOnly, organizationOnly]);

  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController(), epoch = draftPrivacyGeneration();
    setResults({ key: browseKey, loading: true });
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ kind, page: String(page), q: query, party_type: partyType, ...(scope ? { party: scope } : {}) });
      void fetchPage(endpoint, params, controller.signal).then(data => {
        if (controller.signal.aborted || epoch !== draftPrivacyGeneration() || !draftSession(userId)) return;
        if (data.page !== page || data.items.some(item => !validOption(kind, item) || validateRef.current && !validateRef.current(item) || kind === "party" && lookupParty(item.value)?.kind !== partyType)) throw Error("Invalid lookup page");
        setResults({ key: browseKey, data, loading: false });
      }).catch(() => { if (!controller.signal.aborted) setResults({ key: browseKey, loading: false, error: true }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [browseKey, open, disabled, kind, scope, partyType, page, query, retry, userId, endpoint]);

  const current = selection.key === key ? selection : { key, status: "loading" as const };
  const data = results.key === browseKey ? results.data : undefined, options = data?.items.filter(item => item.value !== value) ?? [];
  const selectionLabel = current.option?.label ?? (current.status === "error" ? "Selection unavailable — choose another" : "Loading current selection…");
  const loading = open && (!results.key || results.key !== browseKey || results.loading);
  return <div className="quote-lookup" data-lookup={name}>
    <div className="quote-lookup-heading">
      <label htmlFor={id}>{label}</label>
      <button aria-expanded={open} aria-controls={searchId} className="quote-lookup-toggle" disabled={disabled || !hydrated} type="button" onClick={() => setOpen(!open)}><Search aria-hidden="true" size={14} />{open ? "Close search" : "Search or browse"}</button>
    </div>
    {open ? <div className="quote-lookup-search" id={searchId}>
      {kind === "party" && !customerOnly && !organizationOnly ? <div aria-label="Search contracting party type" className="quote-lookup-types">{(["customer", "organization"] as const).map(type => <button aria-pressed={partyType === type} className="secondary-action" key={type} type="button" onClick={() => { setPartyType(type); setQuery(""); setPage(1); }}>{type === "customer" ? "Customers" : "Organizations"}</button>)}</div> : null}
      <label htmlFor={`${id}-query`}>Search {kind === "party" ? partyType === "customer" ? "customers" : "organizations" : kind === "location" ? "locations" : kind === "job" ? "work descriptions" : kind === "contact" ? "contacts" : "estimate events"}</label>
      <input autoComplete="off" id={`${id}-query`} maxLength={120} type="search" value={query} onChange={event => { event.stopPropagation(); setQuery(event.target.value); setPage(1); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); } }} />
    </div> : null}
    <select aria-describedby={statusId} disabled={disabled} id={id} name={name} required={required} value={value} onChange={event => {
      const next = event.target.value, option = [current.option, ...options].find(item => item?.value === next);
      if (option) cache.current.set(quoteLookupKey(userId, kind, scope, next), option);
      onChange(next);
    }}>
      <option value="">{placeholder}</option>
      {allowNewCustomer ? <option value="new_customer">Create a new walk-in customer</option> : null}
      {value && !(allowNewCustomer && value === "new_customer") ? <option value={value}>{selectionLabel}</option> : null}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {open ? <div className="quote-lookup-pages">
        <button className="secondary-action" disabled={loading || page === 1} type="button" onClick={() => setPage(page - 1)}>Previous</button>
        <button className="secondary-action" disabled={loading || !data || page * data.pageSize >= data.total} type="button" onClick={() => setPage(page + 1)}>Next</button>
    </div> : null}
    <p className="field-note quote-lookup-status" id={statusId} aria-live="polite">
      {current.status === "error" && value ? "The current selection could not be verified. Keep it here, retry, or choose another. " : ""}
      {loading ? "Loading choices…" : open && results.error ? "Choices could not load. Your selection is unchanged." : data ? data.items.length ? `Showing ${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} of ${data.total}.` : data.total ? "No choices on this page. Use Previous or refine the search." : "No matching choices." : ""}
    </p>
    {(current.status === "error" || open && results.error) ? <button className="secondary-action" type="button" onClick={() => setRetry(retry + 1)}>Retry lookup</button> : null}
  </div>;
}
