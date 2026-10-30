"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DRAFT_PRIVACY_EVENT, draftPrivacyState, draftSession } from "@/lib/drafts/browser-privacy";
import { canRestoreDocument, captureDocument, documentDraftKey, MAX_DRAFT_BYTES, readDocument, restoreDocumentFields, type DocumentCopy, type DocumentKind } from "@/lib/drafts/document-drafts";

type Options = {
  userId: string; kind: DocumentKind; recordKey: string; revision: string;
  persistedIds: string[]; dirty: boolean; pending: boolean;
  changeToken: unknown;
  restore: (copy: DocumentCopy) => void;
};

export function useDocumentRecovery(options: Options) {
  const formRef = useRef<HTMLFormElement>(null);
  const current = useRef(options);
  current.current = options;
  const epoch = useRef<string | null>(null);
  const raw = useRef<string | null>(null);
  const loaded = useRef(false);
  const revoked = useRef(false);
  const paused = useRef(false);
  const attempted = useRef(false);
  const requestId = useRef("");
  const [candidate, setCandidate] = useState<DocumentCopy | null>(null);
  const [restoreFields, setRestoreFields] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [ready, setReady] = useState(false);
  const key = documentDraftKey(options.userId, options.kind, options.recordKey);
  const keyRef = useRef(key);
  keyRef.current = key;

  function flush(force = false, submitted?: FormData) {
    try {
      if (!loaded.current || paused.current || !formRef.current || (!force && (!current.current.dirty || current.current.pending))) return;
      if (!epoch.current || epoch.current !== draftSession(current.current.userId)) return;
      if (localStorage.getItem(keyRef.current) !== raw.current) {
        paused.current = true;
        setMessage("Another tab changed this recovery copy. Keep this tab open and save your work before leaving.");
        return;
      }
      const copy = captureDocument(submitted ?? new FormData(formRef.current), current.current, requestId.current, attempted.current);
      const value = JSON.stringify(copy);
      if (value.length > MAX_DRAFT_BYTES || !readDocument(value, current.current)) throw new Error("Draft too large");
      localStorage.setItem(keyRef.current, value);
      raw.current = value;
      setSavedAt(copy.savedAt);
    } catch { setMessage("Recovery is unavailable in this browser or this draft is too large. Save your work before leaving."); }
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    function load() {
      try {
        const session = draftSession(options.userId);
        if (!session) {
          if (loaded.current) revoked.current = true;
          epoch.current = null; paused.current = true; setCandidate(null); setSavedAt(null);
          const checking = draftPrivacyState() === "checking";
          setReady(!loaded.current && !checking);
          setMessage(checking ? "" : loaded.current ? "Your sign-in changed or could not be verified. Reload this editor before continuing." : "Recovery is unavailable until your sign-in can be verified. Save your work before leaving.");
          return;
        }
        if (revoked.current || (epoch.current && epoch.current !== session)) {
          paused.current = true; setCandidate(null);
          setReady(false);
          setMessage("Your sign-in changed. Reload this editor before continuing.");
          return;
        }
        epoch.current = session;
        setReady(true);
        if (loaded.current) return;
        setMessage("");
        loaded.current = true;
        raw.current = localStorage.getItem(key);
        const copy = readDocument(raw.current, options);
        if (raw.current && !copy) { localStorage.removeItem(key); raw.current = null; }
        paused.current = !!copy;
        setCandidate(copy);
        // The user may have typed before the session check finished and before
        // the input debounce fired. Catch up once recovery becomes available.
        if (!copy) queueMicrotask(() => flushRef.current());
      } catch { setReady(true); setMessage("Recovery is unavailable in this browser. Save your work before leaving."); }
    }
    const onStorage = () => load();
    load();
    window.addEventListener(DRAFT_PRIVACY_EVENT, load);
    window.addEventListener("storage", onStorage);
    const onPageHide = () => flushRef.current();
    const onInput = () => { window.clearTimeout(timer); timer = window.setTimeout(() => flushRef.current(), 400); };
    let timer: number;
    const form = formRef.current;
    form?.addEventListener("input", onInput);
    form?.addEventListener("change", onInput);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      flushRef.current(); window.clearTimeout(timer);
      form?.removeEventListener("input", onInput); form?.removeEventListener("change", onInput);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(DRAFT_PRIVACY_EVENT, load); window.removeEventListener("storage", onStorage);
    };
  }, [key, options.userId]);

  // Line buttons change controlled state without firing a native input event.
  // Debounce after every dirty render; never run this effect on recovery status.
  const snapshot = JSON.stringify(options.changeToken);
  useEffect(() => {
    if (!options.dirty || options.pending) return;
    const timer = window.setTimeout(() => flushRef.current(), 400);
    return () => window.clearTimeout(timer);
  }, [snapshot, options.dirty, options.pending]);

  useLayoutEffect(() => {
    if (restoreFields && formRef.current) { restoreDocumentFields(formRef.current, restoreFields); setRestoreFields(null); }
  }, [restoreFields]);

  function discard() {
    try {
      if (localStorage.getItem(key) === raw.current) localStorage.removeItem(key);
      raw.current = localStorage.getItem(key);
      paused.current = !!raw.current;
      setCandidate(readDocument(raw.current, current.current)); setSavedAt(null);
    } catch { setMessage("Could not remove the recovery copy. Browser storage is unavailable."); }
  }
  function restore() {
    if (!candidate || !canRestoreDocument(candidate, options.revision, options.persistedIds)) return;
    if (!readDocument(JSON.stringify(candidate), options)) { discard(); setMessage("The recovery copy has expired. Use the current saved record."); return; }
    if (options.dirty && !window.confirm("Replace the unsaved work on this page with the recovery copy?")) return;
    requestId.current = candidate.requestId;
    attempted.current = candidate.attempted;
    setNeedsReview(candidate.attempted && options.recordKey.startsWith("new:"));
    options.restore(candidate);
    setRestoreFields(candidate.fields);
    setCandidate(null); paused.current = false; setSavedAt(candidate.savedAt);
  }
  function acknowledge() {
    // Clear only after the server has acknowledged the save, never before a
    // request, on an error, or merely because a navigation started.
    paused.current = true; attempted.current = false; discard();
    paused.current = true;
  }
  function changed() { if (!candidate) paused.current = false; }
  function beforeSubmit(id = "", submitted?: FormData) {
    // The reliable-action hook disables the fieldset before invoking the action.
    // Use its original submission, never an empty read of disabled DOM controls.
    requestId.current = id; attempted.current = true; flush(true, submitted);
  }

  return { ready, formRef, candidate, message, savedAt, restore, discard, acknowledge, changed, beforeSubmit,
    requestId, needsReview, confirmReviewed: () => setNeedsReview(false), blocked: !ready || !!candidate || needsReview,
    stale: !!candidate && !canRestoreDocument(candidate, options.revision, options.persistedIds) };
}
