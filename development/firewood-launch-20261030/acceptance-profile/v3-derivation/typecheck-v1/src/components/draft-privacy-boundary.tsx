"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearBrowserDrafts, draftPrivacyGeneration, suspendBrowserDrafts, verifyDraftOwner } from "@/lib/drafts/browser-privacy";

export function DraftPrivacyBoundary() {
  const pathname = usePathname();
  useEffect(() => {
    let live = true;
    let revision = 0;
    const controller = new AbortController();
    const check = async () => {
      const attempt = ++revision;
      const generation = draftPrivacyGeneration();
      try {
        const response = await fetch("/api/internal/draft-session", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!live || attempt !== revision || generation !== draftPrivacyGeneration()) return;
        if (response.status === 401 || response.status === 403) clearBrowserDrafts();
        else if (!response.ok) suspendBrowserDrafts();
        else {
          const data: unknown = await response.json();
          if (!live || attempt !== revision || generation !== draftPrivacyGeneration()) return;
          if (data && typeof data === "object" && "userId" in data && typeof data.userId === "string") verifyDraftOwner(data.userId);
          else suspendBrowserDrafts();
        }
      } catch { if (live && attempt === revision && generation === draftPrivacyGeneration()) suspendBrowserDrafts(); }
    };
    void check();
    const onFocus = () => { void check(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { live = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [pathname]);
  return null;
}
