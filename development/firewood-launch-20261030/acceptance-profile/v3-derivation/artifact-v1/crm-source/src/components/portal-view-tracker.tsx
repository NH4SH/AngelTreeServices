"use client";

import { useEffect } from "react";

const visibleDelayMs = 2_000;
const sessionLifetimeMs = 30 * 60 * 1000;
const sessionStorageKey = "ats:portal-view-session:v1";

type PortalViewTrackerProps = {
  documentType: "invoice" | "quote";
  token: string;
};

type StoredSession = {
  expiresAt: number;
  id: string;
};

let fallbackSession: StoredSession | null = null;

export function PortalViewTracker({ documentType, token }: PortalViewTrackerProps) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const cancelTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const sendView = () => {
      if (disposed || document.visibilityState !== "visible") return;

      const payload = JSON.stringify({
        documentType,
        sessionId: getPortalSessionId(),
        token,
      });
      const blob = new Blob([payload], { type: "application/json" });

      if (navigator.sendBeacon?.("/api/portal/views", blob)) return;

      void fetch("/api/portal/views", {
        body: payload,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      }).catch(() => undefined);
    };

    const scheduleView = () => {
      cancelTimer();
      if (document.visibilityState === "visible") {
        timer = setTimeout(sendView, visibleDelayMs);
      }
    };

    document.addEventListener("visibilitychange", scheduleView);
    scheduleView();

    return () => {
      disposed = true;
      cancelTimer();
      document.removeEventListener("visibilitychange", scheduleView);
    };
  }, [documentType, token]);

  return null;
}

function getPortalSessionId() {
  const now = Date.now();

  if (fallbackSession?.expiresAt && fallbackSession.expiresAt > now) {
    return fallbackSession.id;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(sessionStorageKey) ?? "null") as StoredSession | null;
    if (parsed?.id && parsed.expiresAt > now) return parsed.id;
  } catch {
    // A blocked or malformed store should never affect portal access.
  }

  const session: StoredSession = {
    expiresAt: now + sessionLifetimeMs,
    id: createSessionId(),
  };
  fallbackSession = session;

  try {
    localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  } catch {
    // The module-level fallback still provides a valid, non-identifying ID.
  }

  return session.id;
}

function createSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
