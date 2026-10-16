"use client";

import { DRAFT_PREFIX } from "./document-drafts";

const ownerKey = "ats-draft-owner-v1";
const epochKey = "ats-draft-epoch-v1";
export const DRAFT_PRIVACY_EVENT = "ats-draft-privacy";
let verifiedOwner: string | null = null;
let privacyState: "checking" | "verified" | "unavailable" | "signedout" = "checking";
export const draftPrivacyState = () => privacyState;
let generation = 0;
export const draftPrivacyGeneration = () => {
  try { return `${generation}:${localStorage.getItem(epochKey)}`; } catch { return String(generation); }
};

export function suspendBrowserDrafts() {
  verifiedOwner = null;
  privacyState = "unavailable";
  window.dispatchEvent(new Event(DRAFT_PRIVACY_EVENT));
}

export function clearBrowserDrafts() {
  ++generation;
  verifiedOwner = null;
  privacyState = "signedout";
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    localStorage.removeItem(ownerKey);
    localStorage.setItem(epochKey, crypto.randomUUID());
  } catch { /* Storage may be blocked. Editors report that recovery is unavailable. */ }
  window.dispatchEvent(new Event(DRAFT_PRIVACY_EVENT));
}

export function verifyDraftOwner(userId: string | null) {
  try {
    if (!userId || localStorage.getItem(ownerKey) !== userId) clearBrowserDrafts();
    if (userId) {
      localStorage.setItem(ownerKey, userId);
      if (!localStorage.getItem(epochKey)) localStorage.setItem(epochKey, crypto.randomUUID());
    }
    verifiedOwner = userId;
    privacyState = userId ? "verified" : "signedout";
  } catch { verifiedOwner = null; privacyState = "unavailable"; }
  window.dispatchEvent(new Event(DRAFT_PRIVACY_EVENT));
}

export function draftSession(userId: string) {
  return verifiedOwner === userId && localStorage.getItem(ownerKey) === userId ? localStorage.getItem(epochKey) : null;
}
