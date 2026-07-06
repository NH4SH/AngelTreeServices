"use client";

import { useEffect } from "react";

const resetSeenKey = "ats:crew-view-reset-seen-at";
const exactStorageKeys = [
  "crewViewMode",
  "crewViewFilters",
  "crewDashboardPreferences",
  "crewJobsFilter",
  "crewJobsView",
  "ats:crew:view",
  "ats:crew:filters",
  "ats:crew:dashboard",
];
const storageKeyPrefixes = [
  "ats:crew:",
  "angel-tree:crew:",
  "crew:view:",
  "crew:filters:",
  "crewDashboard:",
];

export function CrewViewResetWatcher({ resetRequestedAt }: { resetRequestedAt: string | null }) {
  useEffect(() => {
    if (!resetRequestedAt) {
      return;
    }

    try {
      const lastSeenReset = window.localStorage.getItem(resetSeenKey);

      if (lastSeenReset === resetRequestedAt) {
        return;
      }

      clearDisplayStorage(window.localStorage);
      clearDisplayStorage(window.sessionStorage);
      window.localStorage.setItem(resetSeenKey, resetRequestedAt);
    } catch {
      // Storage access can be blocked by browser settings; the crew app should still open.
    }
  }, [resetRequestedAt]);

  return null;
}

function clearDisplayStorage(storage: Storage) {
  exactStorageKeys.forEach((key) => storage.removeItem(key));

  Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key))
    .filter((key) => storageKeyPrefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => storage.removeItem(key));
}
